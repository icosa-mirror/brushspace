import { describe, expect, it } from "vitest";

import {
  applyUIKitProperties,
  clearUIKitInteractionStateExcept,
} from "./uikit-interaction.js";

interface FakeElement {
  hoveredList: { value: unknown[] };
  activeList: { value: unknown[] };
  children: FakeElement[];
  parent?: FakeElement;
}

function element(children: FakeElement[] = []): FakeElement {
  const node: FakeElement = {
    hoveredList: { value: [1] },
    activeList: { value: [1] },
    children,
  };
  for (const child of children) {
    child.parent = node;
  }
  return node;
}

describe("clearUIKitInteractionStateExcept", () => {
  it("clears hover and active lists recursively", () => {
    const leaf = element();
    const root = element([element([leaf])]);
    clearUIKitInteractionStateExcept(root);
    expect(root.hoveredList.value).toHaveLength(0);
    expect(leaf.hoveredList.value).toHaveLength(0);
    expect(leaf.activeList.value).toHaveLength(0);
  });

  it("keeps the excepted element and its ancestors", () => {
    const target = element();
    const sibling = element();
    const root = element([element([target, sibling])]);
    clearUIKitInteractionStateExcept(root, target);
    expect(target.hoveredList.value).toHaveLength(1);
    expect(target.parent!.hoveredList.value).toHaveLength(1);
    expect(sibling.hoveredList.value).toHaveLength(0);
  });

  it("enters a UIKitDocument through rootElement", () => {
    // Regression: documents expose rootElement, not children — passing one
    // used to silently clear nothing.
    const cell = element();
    const fakeDocument = { rootElement: element([cell]) };
    clearUIKitInteractionStateExcept(fakeDocument);
    expect(cell.hoveredList.value).toHaveLength(0);
    expect(fakeDocument.rootElement.hoveredList.value).toHaveLength(0);
  });
});

describe("applyUIKitProperties", () => {
  it("sets properties, then repairs conditional reactivity via updateAll", () => {
    // Regression: uikit-pub-sub's clearProvidedLayer (run inside every
    // setProperties) orphans the effect watching hover/active conditional
    // layers when the element is restyled while hovered, freezing the hover
    // fill. updateAll() is uikit's own repair path and must run AFTER the
    // write.
    const calls: string[] = [];
    const fakeElement = {
      setProperties(properties: Record<string, unknown>) {
        calls.push(`set:${String(properties.backgroundColor)}`);
      },
      properties: {
        updateAll() {
          calls.push("updateAll");
        },
      },
    };
    applyUIKitProperties(fakeElement, { backgroundColor: "red" });
    expect(calls).toEqual(["set:red", "updateAll"]);
  });

  it("tolerates elements without a properties implementation", () => {
    const fakeElement = {
      setProperties() {},
    };
    expect(() =>
      applyUIKitProperties(fakeElement, { backgroundColor: "red" }),
    ).not.toThrow();
  });
});
