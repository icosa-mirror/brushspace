import { initialLoad } from "./initial-load.js";

/**
 * Drives the HTML loading overlay (wordmark + progress bar) from the shared
 * initial-load tracker, then fades it away once the landing scene is ready.
 * The overlay markup lives in index.html so it paints before this module
 * even executes.
 */
export function setupLoadingScreen(): void {
  const screen = document.getElementById("loading-screen");
  const fill = document.getElementById("loading-bar-fill");
  if (!screen || !fill) {
    return;
  }
  const unsubscribe = initialLoad.subscribe((progress) => {
    fill.style.width = `${(progress * 100).toFixed(1)}%`;
  });
  void initialLoad.whenDone.then(() => {
    unsubscribe();
    fill.style.width = "100%";
    screen.classList.add("done");
    screen.addEventListener("transitionend", () => screen.remove(), {
      once: true,
    });
    // Transitions don't run in hidden tabs; make sure the overlay still goes.
    window.setTimeout(() => screen.remove(), 1000);
  });
}
