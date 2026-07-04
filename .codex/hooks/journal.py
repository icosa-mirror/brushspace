#!/usr/bin/env python3
import base64
import json
import os
import re
import shutil
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

# Codex records most desktop tools as function_call response items. Treat direct
# patch/file-edit tools as work, and classify shell commands by their command text.
WORK_TOOLS = {"apply_patch", "apply_patch_freeform"}

FILE_OP_REDACT = {
    "apply_patch": ("patch",),
    "apply_patch_freeform": ("patch",),
    "imagegen": ("prompt",),
}

INPUT_STR_MAX = 400

DEFAULT_SCREENSHOT_TOOL = os.environ.get(
    "JOURNAL_SCREENSHOT_TOOL",
    "mcp__iwsdk-runtime__browser_screenshot",
)

TOOL_RESULT_HEAD = 1500
TOOL_RESULT_TAIL = 300

MUTATING_SHELL_RE = re.compile(
    r"(^|[;&|]\s*)"
    r"(apply_patch|cat\s*>|cp\b|mv\b|rm\b|mkdir\b|rmdir\b|touch\b|"
    r"ln\b|chmod\b|chown\b|rsync\b|tee\s+(?!/dev/null\b)|"
    r"sed\s+-i\b|perl\s+-pi\b|"
    r"git\s+(?:clone|checkout|switch|restore|reset|merge|rebase|pull|stash\s+(?:pop|apply))\b|"
    r"npm\s+(?:i|install|add|remove|uninstall|update|dedupe|audit\s+fix)\b|"
    r"pnpm\s+(?:i|install|add|remove|uninstall|update|up|dedupe)\b|"
    r"yarn\s+(?:add|remove|upgrade|install)\b|"
    r"bun\s+(?:add|remove|install|update)\b|"
    r"npx\s+(?:create-|create\b|degit\b|shadcn\b))",
    re.IGNORECASE,
)

WRITE_REDIRECT_RE = re.compile(r"(?<![0-9])>>?\s*(?!&|/dev/null\b)")

READ_ONLY_SHELL_RE = re.compile(
    r"^\s*(?:"
    r"ls|pwd|date|sed|cat|rg|grep|find|head|tail|wc|jq|git\s+(?:status|diff|show|log|ls-files|branch|rev-parse)|"
    r"codex\s+features\s+list|python3?\s+-m\s+py_compile|"
    r"npm\s+run\s+(?:dev|test|typecheck|check|build)\b|npx\s+(?:tsc|iwsdk)\b"
    r")\b",
    re.IGNORECASE,
)

CHECKPOINT_PROMPT = """\
Checkpoint needed: workspace-changing work happened after the last visual
checkpoint. Capture one screenshot from inside VR that frames the current state.
The journal hook will save the image automatically when the Codex transcript
exposes image data; you do not need to write the file yourself.

Workflow (use the iwsdk-runtime XR tools to pilot the headset and frame the shot):

  1. Enter XR if not already in a session:
       mcp__iwsdk-runtime__xr_get_session_status
       mcp__iwsdk-runtime__xr_accept_session   (only if no active session)

  2. Identify the scene object that represents the work you just did. Use any of:
       mcp__iwsdk-runtime__scene_get_hierarchy        (find by name, get UUID)
       mcp__iwsdk-runtime__ecs_find_entities          (find by component / regex)
       mcp__iwsdk-runtime__ecs_query_entity           (read component values)
       mcp__iwsdk-runtime__scene_get_object_transform (get positionRelativeToXROrigin)

  3. Pilot the headset to a vantage point and orient it at the subject:
       mcp__iwsdk-runtime__xr_set_transform   (snap headset to a pose)
       mcp__iwsdk-runtime__xr_animate_to      (smoothly fly the headset there)
       mcp__iwsdk-runtime__xr_look_at         (aim at a world position; can also move-to)
       mcp__iwsdk-runtime__xr_get_transform   (verify pose)

     Pass positionRelativeToXROrigin from scene_get_object_transform to xr_look_at.
     Take a couple of test shots while framing if you need to. Extras are fine.

  4. From inside VR, with the subject framed, capture:
       %(tool)s

  5. After the screenshot returns, stop normally. This hook will not block again
     in this stop chain. Pure Q&A/read-only turns should not require a
     checkpoint.
""" % {"tool": DEFAULT_SCREENSHOT_TOOL}


# ---------- helpers ----------

def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def safe_id(s):
    return re.sub(r"[^A-Za-z0-9_-]", "_", s or "x")[:48]


def truncate_text(s):
    if not isinstance(s, str):
        s = json.dumps(s, ensure_ascii=False)
    n = len(s)
    if n <= TOOL_RESULT_HEAD + TOOL_RESULT_TAIL + 64:
        return s, False
    head = s[:TOOL_RESULT_HEAD]
    tail = s[-TOOL_RESULT_TAIL:]
    middle = "\n...[truncated %d chars]...\n" % (n - TOOL_RESULT_HEAD - TOOL_RESULT_TAIL)
    return head + middle + tail, True


def shrink_input(tool_name, value):
    """Drop large payload fields and truncate long string values."""
    if isinstance(value, str):
        parsed = parse_json_string(value)
        value = parsed if parsed is not None else {"value": value}
    if not isinstance(value, dict):
        return value

    redact_fields = set(FILE_OP_REDACT.get(tool_name, ()))
    out = {}
    for k, v in value.items():
        if k in redact_fields:
            if isinstance(v, str):
                out[k] = "<redacted %d chars>" % len(v)
            elif isinstance(v, list):
                out[k] = "<redacted %d items>" % len(v)
            else:
                out[k] = "<redacted>"
        elif isinstance(v, str) and len(v) > INPUT_STR_MAX:
            out[k] = v[:INPUT_STR_MAX] + "...[truncated %d chars]" % (len(v) - INPUT_STR_MAX)
        else:
            out[k] = v
    return out


def parse_json_string(value):
    if not isinstance(value, str):
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def first_present(obj, keys):
    if not isinstance(obj, dict):
        return None
    for key in keys:
        value = obj.get(key)
        if value not in (None, ""):
            return value
    return None


def collect_text(value):
    parts = []

    def visit(node):
        if node is None:
            return
        if isinstance(node, str):
            parts.append(node)
            return
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict):
            return
        for key in ("text", "input_text", "output_text", "summary_text", "message", "content"):
            inner = node.get(key)
            if inner is not None:
                visit(inner)

    visit(value)
    return "\n".join(p for p in parts if p)


def is_hook_control_text(text):
    return isinstance(text, str) and text.lstrip().startswith("<hook_prompt")


def is_hidden_journal_event(event):
    return event.get("type") == "user_message" and is_hook_control_text(event.get("content"))


def is_screenshot_tool(name):
    return bool(name) and "screenshot" in name.lower()


def is_shell_tool(name):
    return name in {"exec_command", "write_stdin", "local_shell", "shell", "Bash"}


def command_from_input(value):
    if not isinstance(value, dict):
        return ""
    return str(value.get("cmd") or value.get("command") or value.get("chars") or "")


def shell_command_is_work(command):
    if not command:
        return False
    if MUTATING_SHELL_RE.search(command) or WRITE_REDIRECT_RE.search(command):
        return True
    if READ_ONLY_SHELL_RE.search(command):
        return False
    return False


def tool_event_is_work(event):
    tool = event.get("tool")
    if not tool or is_screenshot_tool(tool):
        return False
    if tool in WORK_TOOLS:
        return True
    if is_shell_tool(tool):
        return shell_command_is_work(command_from_input(event.get("input")))
    return False


# ---------- transcript I/O ----------

def parse_transcript_slice(path, offset):
    """Read Codex rollout JSONL from offset.

    Returns (entries, new_offset, reset_performed). If the file is smaller than
    offset, parse from the start so compaction/rotation does not break the hook.
    """
    size = path.stat().st_size
    if offset > size:
        offset = 0
        reset = True
    else:
        reset = False
    entries = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(offset)
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entries.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        new_offset = f.tell()
    return entries, new_offset, reset


def load_prior_events(journal_path):
    if not journal_path.exists():
        return []
    out = []
    with open(journal_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") in ("session_meta", "hook_decision"):
                continue
            if is_hidden_journal_event(event):
                continue
            out.append(event)
    return out


def write_journal(events, journal_dir, session_id):
    out = journal_dir / ("session-%s.jsonl" % session_id)
    tmp = out.with_suffix(out.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    os.replace(tmp, out)


def load_state(state_path):
    try:
        return json.loads(state_path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state_path, state):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    os.replace(tmp, state_path)


# ---------- checkpoint persistence ----------

def _rel(path, cwd_path):
    try:
        return str(Path(path).resolve().relative_to(cwd_path.resolve()))
    except ValueError:
        return str(path)


def find_screenshot_tool_calls(entries):
    out = []
    for entry in entries:
        ts = entry.get("timestamp")
        payload = entry.get("payload") or {}
        if entry.get("type") != "response_item" or not isinstance(payload, dict):
            continue
        ptype = payload.get("type")
        if ptype in ("function_call", "custom_tool_call", "tool_search_call", "web_search_call"):
            name = first_present(payload, ("name", "tool_name", "action", "query"))
            call_id = first_present(payload, ("call_id", "id"))
            if is_screenshot_tool(name):
                out.append((ts, call_id))
        elif ptype == "local_shell_call":
            name = first_present(payload, ("name", "tool_name")) or "local_shell"
            call_id = first_present(payload, ("call_id", "id"))
            if is_screenshot_tool(name):
                out.append((ts, call_id))
    return out


def iter_tool_outputs(entries, tool_use_id):
    for entry in entries:
        payload = entry.get("payload") or {}
        if not isinstance(payload, dict):
            continue
        if (
            entry.get("type") == "event_msg"
            and payload.get("type") == "mcp_tool_call_end"
            and first_present(payload, ("call_id", "id")) == tool_use_id
        ):
            yield payload
            continue

        if entry.get("type") != "response_item":
            continue
        ptype = payload.get("type")
        if ptype not in (
            "function_call_output",
            "custom_tool_call_output",
            "tool_search_output",
            "web_search_output",
            "local_shell_call_output",
        ):
            continue
        if first_present(payload, ("call_id", "id")) != tool_use_id:
            continue
        yield payload


def image_from_value(value):
    if isinstance(value, str):
        parsed = parse_json_string(value)
        if parsed is not None:
            found = image_from_value(parsed)
            if found:
                return found
        return None
    if isinstance(value, list):
        for item in value:
            found = image_from_value(item)
            if found:
                return found
        return None
    if not isinstance(value, dict):
        return None

    source = value.get("source")
    if isinstance(source, dict) and source.get("type") == "base64" and source.get("data"):
        return source.get("media_type", "image/png"), source["data"], None

    if value.get("type") == "image" and value.get("data"):
        return value.get("media_type", "image/png"), value["data"], None

    for key in ("image", "content", "output", "result", "data", "Ok"):
        found = image_from_value(value.get(key))
        if found:
            return found

    for key in ("path", "file", "file_path", "image_path"):
        path = value.get(key)
        if isinstance(path, str) and re.search(r"\.(png|jpe?g|webp)$", path, re.IGNORECASE):
            return None, None, path

    return None


def find_image_for_tool_use(entries, tool_use_id):
    for output in iter_tool_outputs(entries, tool_use_id):
        found = image_from_value(output)
        if found:
            return found
    return None


def extension_for_media_type(media_type):
    return {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(media_type, "png")


def save_screenshots(entries, checkpoint_dir, session_id, cwd_path):
    """Persist new screenshot results. Returns dict tool_use_id -> relative path."""
    sess_dir = checkpoint_dir / session_id
    sess_dir.mkdir(parents=True, exist_ok=True)

    saved = {}
    for ts, tool_use_id in find_screenshot_tool_calls(entries):
        if not tool_use_id:
            continue
        sid = safe_id(tool_use_id)
        existing = next(sess_dir.glob("*_%s.*" % sid), None)
        if existing is not None:
            saved[tool_use_id] = _rel(existing, cwd_path)
            continue

        image = find_image_for_tool_use(entries, tool_use_id)
        if not image:
            continue
        media_type, data, source_path = image
        ext = extension_for_media_type(media_type or "image/png")
        ts_safe = (ts or "unknown").replace(":", "-")
        path = sess_dir / ("%s_%s.%s" % (ts_safe, sid, ext))

        try:
            if data:
                path.write_bytes(base64.b64decode(data))
                saved[tool_use_id] = _rel(path, cwd_path)
            elif source_path and Path(source_path).exists():
                copied_path = sess_dir / ("%s_%s%s" % (ts_safe, sid, Path(source_path).suffix))
                shutil.copyfile(source_path, copied_path)
                saved[tool_use_id] = _rel(copied_path, cwd_path)
        except (ValueError, OSError):
            continue
    return saved


# ---------- event building ----------

def build_tool_call_event(ts, turn, payload):
    ptype = payload.get("type")
    tool_name = first_present(payload, ("name", "tool_name", "action")) or ptype
    tool_use_id = first_present(payload, ("call_id", "id"))
    raw_input = first_present(payload, ("arguments", "input", "params", "query")) or {}
    parsed_input = parse_json_string(raw_input) if isinstance(raw_input, str) else raw_input
    if parsed_input is None:
        parsed_input = {"value": raw_input}

    return {
        "ts": ts,
        "turn": turn,
        "type": "tool_call",
        "tool": tool_name,
        "tool_use_id": tool_use_id,
        "input": shrink_input(tool_name, parsed_input),
    }


def build_local_shell_call_event(ts, turn, payload):
    tool_use_id = first_present(payload, ("call_id", "id"))
    command = first_present(payload, ("command", "cmd")) or ""
    return {
        "ts": ts,
        "turn": turn,
        "type": "tool_call",
        "tool": "local_shell",
        "tool_use_id": tool_use_id,
        "input": shrink_input("local_shell", {"command": command}),
    }


def attach_saved_screenshot(event, saved_screenshots):
    tool_use_id = event.get("tool_use_id")
    if tool_use_id in saved_screenshots:
        event["has_image"] = True
        event["checkpoint_path"] = saved_screenshots[tool_use_id]


def output_payload_text(payload):
    for key in ("output", "result", "content", "text"):
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            return value
        text = collect_text(value)
        if text:
            return text
        return json.dumps(value, ensure_ascii=False)
    return ""


def output_is_error(payload):
    status = str(payload.get("status") or payload.get("exit_code") or "").lower()
    return bool(payload.get("is_error") or payload.get("error") or status in {"error", "failed", "failure"})


def attach_tool_result(events, pending_tool_calls, ts, turn, payload, saved_screenshots):
    tool_use_id = first_present(payload, ("call_id", "id"))
    text, was_truncated = truncate_text(output_payload_text(payload))
    has_image = bool(image_from_value(payload) or tool_use_id in saved_screenshots)
    is_error = output_is_error(payload)

    target = pending_tool_calls.pop(tool_use_id, None)
    if target is None:
        event = {
            "ts": ts,
            "turn": turn,
            "type": "tool_result",
            "tool_use_id": tool_use_id,
        }
        if text:
            event["result"] = text
        if is_error:
            event["is_error"] = True
        if has_image:
            event["has_image"] = True
        if was_truncated:
            event["truncated"] = True
        if tool_use_id in saved_screenshots:
            event["checkpoint_path"] = saved_screenshots[tool_use_id]
        events.append(event)
        return

    target["result_ts"] = ts
    if text:
        target["result"] = text
    if is_error:
        target["is_error"] = True
    if has_image:
        target["has_image"] = True
    if was_truncated:
        target["truncated"] = True
    if tool_use_id in saved_screenshots:
        target["checkpoint_path"] = saved_screenshots[tool_use_id]


def build_new_events(new_entries, saved_screenshots, pending_tool_calls, state, turn):
    events = []
    for entry in new_entries:
        ts = entry.get("timestamp")
        etype = entry.get("type")
        payload = entry.get("payload") or {}

        if "started_at" not in state and ts:
            state["started_at"] = ts

        if etype == "session_meta" and isinstance(payload, dict):
            if payload.get("id") and "rollout_id" not in state:
                state["rollout_id"] = payload["id"]
            if payload.get("timestamp") and "started_at" not in state:
                state["started_at"] = payload["timestamp"]
            git = payload.get("git") or {}
            if isinstance(git, dict) and git.get("branch") and "git_branch" not in state:
                state["git_branch"] = git["branch"]
            if payload.get("git_branch") and "git_branch" not in state:
                state["git_branch"] = payload["git_branch"]
            if payload.get("version") and "codex_version" not in state:
                state["codex_version"] = payload["version"]
            continue

        if etype == "turn_context" and isinstance(payload, dict):
            if payload.get("model") and "model" not in state:
                state["model"] = payload["model"]
            if payload.get("cwd"):
                state["last_cwd"] = payload["cwd"]
            if payload.get("turn_id"):
                state["last_turn_id"] = payload["turn_id"]
            continue

        if etype != "response_item" or not isinstance(payload, dict):
            continue

        ptype = payload.get("type")

        if ptype == "message":
            role = payload.get("role")
            text = collect_text(payload.get("content"))
            if not text:
                continue
            if role == "user" and is_hook_control_text(text):
                continue
            text, was_truncated = truncate_text(text)
            if role == "user":
                event = {"ts": ts, "turn": turn, "type": "user_message", "content": text}
            elif role == "assistant":
                event = {"ts": ts, "turn": turn, "type": "assistant_text", "content": text}
                if payload.get("phase"):
                    event["phase"] = payload["phase"]
            else:
                continue
            if was_truncated:
                event["truncated"] = True
            events.append(event)
            continue

        if ptype == "function_call":
            event = build_tool_call_event(ts, turn, payload)
            attach_saved_screenshot(event, saved_screenshots)
            events.append(event)
            if event.get("tool_use_id"):
                pending_tool_calls[event["tool_use_id"]] = event
            continue

        if ptype in ("custom_tool_call", "tool_search_call", "web_search_call"):
            event = build_tool_call_event(ts, turn, payload)
            attach_saved_screenshot(event, saved_screenshots)
            events.append(event)
            if event.get("tool_use_id"):
                pending_tool_calls[event["tool_use_id"]] = event
            continue

        if ptype == "local_shell_call":
            event = build_local_shell_call_event(ts, turn, payload)
            attach_saved_screenshot(event, saved_screenshots)
            events.append(event)
            if event.get("tool_use_id"):
                pending_tool_calls[event["tool_use_id"]] = event
            continue

        if ptype in (
            "function_call_output",
            "custom_tool_call_output",
            "tool_search_output",
            "web_search_output",
            "local_shell_call_output",
        ):
            attach_tool_result(events, pending_tool_calls, ts, turn, payload, saved_screenshots)
            continue

    return events


def build_session_meta(state, all_events, session_id, cwd):
    updated_at = state.get("started_at")
    user_messages = 0
    tool_uses = 0
    for event in all_events:
        ts = event.get("ts")
        if ts:
            updated_at = ts
        etype = event.get("type")
        if etype == "user_message":
            user_messages += 1
        elif etype in ("tool_call", "tool_result"):
            tool_uses += 1
    return {
        "ts": state.get("started_at"),
        "type": "session_meta",
        "session_id": session_id,
        "cwd": cwd,
        "model": state.get("model"),
        "git_branch": state.get("git_branch"),
        "codex_version": state.get("codex_version"),
        "rollout_id": state.get("rollout_id"),
        "started_at": state.get("started_at"),
        "updated_at": updated_at,
        "user_messages": user_messages,
        "tool_uses": tool_uses,
    }


def has_work_since_last_screenshot(all_events):
    last_shot = -1
    for i, event in enumerate(all_events):
        if event.get("type") == "tool_call" and is_screenshot_tool(event.get("tool")):
            last_shot = i
    for i, event in enumerate(all_events):
        if i <= last_shot:
            continue
        if event.get("type") == "tool_call" and tool_event_is_work(event):
            return True
    return False


# ---------- main ----------

def emit(obj):
    sys.stdout.write(json.dumps(obj))
    sys.stdout.flush()


def _run():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}

    transcript_path = payload.get("transcript_path")
    session_id = payload.get("session_id") or "unknown"
    cwd = payload.get("cwd") or os.getcwd()
    stop_hook_active = bool(payload.get("stop_hook_active"))

    if payload.get("model"):
        hook_model = payload.get("model")
    else:
        hook_model = None

    if not transcript_path:
        emit({"suppressOutput": True})
        return
    transcript_path = Path(os.path.expanduser(transcript_path))
    if not transcript_path.exists():
        emit({"suppressOutput": True})
        return

    cwd_path = Path(cwd)
    journal_dir = cwd_path / ".codex" / "journal"
    journal_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = journal_dir / "checkpoints"
    journal_path = journal_dir / ("session-%s.jsonl" % session_id)
    state_path = journal_dir / "state" / ("%s.json" % session_id)

    state = load_state(state_path)
    if hook_model and "model" not in state:
        state["model"] = hook_model

    offset = state.get("transcript_offset")
    first_run = offset is None
    if first_run:
        offset = 0

    new_entries, new_offset, reset = parse_transcript_slice(transcript_path, offset)
    if reset or first_run:
        state = {"model": hook_model} if hook_model else {}
        prior_events = []
    else:
        prior_events = load_prior_events(journal_path)

    pending_tool_calls = {
        event["tool_use_id"]: event
        for event in prior_events
        if event.get("type") == "tool_call" and "result_ts" not in event and event.get("tool_use_id")
    }

    saved_screenshots = save_screenshots(new_entries, checkpoint_dir, session_id, cwd_path)

    current_turn = state.get("turn", 1)
    new_events = build_new_events(new_entries, saved_screenshots, pending_tool_calls, state, current_turn)
    all_events = prior_events + new_events

    if stop_hook_active:
        decision = {"action": "allowed", "reason": "stop_hook_active"}
    elif not has_work_since_last_screenshot(all_events):
        decision = {"action": "allowed", "reason": "no work since last checkpoint"}
    else:
        decision = {"action": "blocked", "reason": "checkpoint required", "prompt_id": "checkpoint_v1"}

    output = [build_session_meta(state, all_events, session_id, cwd)]
    output.extend(all_events)
    output.append({"ts": iso_now(), "turn": current_turn, "type": "hook_decision", **decision})
    write_journal(output, journal_dir, session_id)

    state["transcript_offset"] = new_offset
    state["turn"] = current_turn + 1 if decision["action"] == "allowed" else current_turn
    save_state(state_path, state)

    if decision["action"] == "allowed":
        emit({"suppressOutput": True})
    else:
        emit({"decision": "block", "reason": CHECKPOINT_PROMPT})


def main():
    try:
        _run()
    except Exception:
        try:
            cwd = os.getcwd()
            log_path = Path(cwd) / ".codex" / "journal" / "hook-errors.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write("\n----- %s -----\n" % iso_now())
                traceback.print_exc(file=f)
        except Exception:
            pass
        emit({"suppressOutput": True})


if __name__ == "__main__":
    main()
