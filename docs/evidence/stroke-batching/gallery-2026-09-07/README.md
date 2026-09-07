# Curated-gallery batching evidence

1. `summary.json` contains three off/on pairs, ordered off/on, on/off, off/on.
   Each page measures thirty seconds after shader loading and settling.
   Full raw timing arrays remain in the local `.iwsdk/batching-gallery-measured`
   directory; `scripts/summarize-gallery-batching.mjs` reproduces the summary.
2. `reference.png` and `batched.png` are the first pair's matched browser captures.
   The source scene is dark in both. See summary image comparisons and measured
   reference variation, rather than interpreting a single animated frame as an
   exact image equality test.
3. `gallery-selection.json` records the public gallery entries and the chosen
   source asset, including its author and original download URL. The benchmark
   workload label is simply “curated gallery sketch”.
4. `lifecycle.json` records checks of the twelve brush types present in the
   loaded sketch, plus layer visibility, after the shared culling-policy fix.
5. `xr.json` records emulated two-eye XR rendering and clean exit. It is not a
   real-headset performance result. Hardware timing is still outstanding.
6. These captures used explicit off/on flags. Batching is now enabled by default
   with `?strokeBatches=0` available to opt out. CPU render-submission time improves;
   variable GPU timings do not establish a GPU or delivered-frame-rate gain.
