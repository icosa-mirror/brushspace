/**
 * UIKit keeps per-element hovered/active pointer lists; when the ray leaves
 * an element mid-press (or the release routes to another panel) those lists
 * can be left populated, freezing the hover/pressed styling. These helpers
 * force-clear that state.
 */
export interface UIKitInteractionElement {
  hoveredList?: { value: unknown[] };
  activeList?: { value: unknown[] };
  children?: Iterable<unknown>;
  parent?: unknown;
}

/**
 * Clears stale hover/active styling on every element under `root` except the
 * given element and its ancestor chain (so the interaction being processed
 * keeps its own feedback).
 */
export function clearUIKitInteractionStateExcept(
  root: unknown,
  except?: unknown,
): void {
  const keep = new Set<unknown>();
  let node = except as UIKitInteractionElement | undefined;
  while (node && typeof node === "object") {
    keep.add(node);
    node = node.parent as UIKitInteractionElement | undefined;
  }
  // A UIKitDocument is not itself an element: enter through its root, or
  // the walk silently clears nothing.
  const documentRoot = (root as { rootElement?: unknown } | undefined)
    ?.rootElement;
  clearRecursive(documentRoot ?? root, keep);
}

function clearRecursive(element: unknown, keep: ReadonlySet<unknown>): void {
  if (!element || typeof element !== "object") {
    return;
  }
  const interaction = element as UIKitInteractionElement;
  if (!keep.has(element)) {
    if (interaction.hoveredList && interaction.hoveredList.value.length > 0) {
      interaction.hoveredList.value = [];
    }
    if (interaction.activeList && interaction.activeList.value.length > 0) {
      interaction.activeList.value = [];
    }
  }
  if (!interaction.children) {
    return;
  }
  for (const child of interaction.children) {
    clearRecursive(child, keep);
  }
}

/**
 * Restyles an element and repairs UIKit's conditional-style reactivity.
 *
 * uikit-pub-sub's `clearProvidedLayer` (run at the start of every
 * `setProperties`) destroys the effect that watches hover/active conditional
 * layers, but only re-installs it when the currently-published value came
 * from the layer being rewritten. Restyling an element WHILE it is hovered
 * therefore freezes the hover fill into the published signal forever — the
 * stuck grey tile bug. `updateAll()` is uikit's own repair path (used by
 * `setEnabled`): it re-selects every published property and re-installs the
 * conditional effects, so hover-exit works again.
 */
export function applyUIKitProperties(
  element: unknown,
  properties: Record<string, unknown>,
): void {
  const styleElement = element as {
    setProperties(properties: Record<string, unknown>): void;
    properties?: { updateAll?: () => void };
  };
  styleElement.setProperties(properties);
  styleElement.properties?.updateAll?.();
}
