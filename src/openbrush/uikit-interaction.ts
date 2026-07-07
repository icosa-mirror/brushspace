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
  clearRecursive(root, keep);
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
