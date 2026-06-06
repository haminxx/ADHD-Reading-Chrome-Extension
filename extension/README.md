# Focus Reader - ADHD Bionic Reading (Chrome Extension)

A Manifest V3 Chrome extension that helps people with ADHD read with less effort
by making the **leading half of every word bold**. These bold "anchors" give the
eye a fixation point per word, which many readers (and the ADHD researcher whose
idea inspired this) find makes continuous reading noticeably easier.

It works two ways:

1. **On any web page** - click the toolbar icon, hit **Start Reading**, and the
   page text is reformatted live.
2. **On your own documents** - import a **PDF or text file** from the popover and
   it opens in a clean, distraction-light **reader tab** with the same bionic
   formatting.

Example:

> **Bio**nic **READ**ing **hel**ps **peo**ple **fo**cus **the**ir **atten**tion.

## How the bolding works

For a word of length `n`, the first `ceil(n * intensity)` characters are bolded
(default `intensity = 0.5`):

| Word      | Letters | Bold (50%) | Result      |
| --------- | ------- | ---------- | ----------- |
| `Bionic`  | 6       | 3          | **Bio**nic  |
| `reading` | 7       | 4          | **READ**ing |

Drag the **intensity** slider toward *Light* (≈40%) to bold *less than half*
(`reading -> ` **REA**`ding`), or toward *Heavy* for more.

## Gaze Reading (beta)

A second, **separate** mode (it does not change or replace the static bolding
above). When you turn it on, Focus Reader uses your **webcam** to estimate where
on the page you're looking, finds the word near that point, and animates a
bionic bold **sweep** across that word's leading characters at a reading pace —
so the front of the word you're on emphasizes while the rest stays readable.

It works as an overlay on **any** website.

### Realistic precision (please read)

Browser webcam gaze tracking is **word/line-level**, not exact-character. The
"character-by-character" effect is a reading-paced **animation** over the word
you're looking at — not literal per-character eye resolution. To keep it from
thrashing on jittery gaze we apply **low-pass smoothing** plus a short **dwell
threshold** (~160 ms) before a word activates.

It is a **beta**: accuracy depends heavily on lighting, camera quality, and how
still you sit. Expect it to be approximate.

### Requirements

- A working **webcam** and permission to use it on the page.
- **Good, even lighting** on your face; avoid strong backlight.
- A quick **calibration** (a 3×3 grid of dots you look at and click) the first
  time you enable it. You can **Recalibrate** any time from the popup.

### How to use it

1. Open the toolbar popup and flip **Gaze Reading (beta)** on. (Use it on a
   normal `http(s)` web page.)
2. The page asks for **camera permission** — allow it. *(Because the gaze code
   runs in the page's content script, the camera prompt is for the **website's**
   origin, not the extension. This is an MV3 limitation: content-script
   `getUserMedia` uses the host page's origin. You may be re-prompted per site.)*
3. A **calibration overlay** appears. Look at each red dot and click it a few
   times; dots turn green as they learn your gaze.
4. After calibration, read normally. A faint dot shows the estimated gaze point,
   and words emphasize as you look at them.
5. Turn it off in the popup (everything is torn down and the camera stops), or
   click **Recalibrate** to retrain.

**Per-tab on purpose:** gaze starts only on the tab where you turn it on — it
does **not** silently turn the camera on for every site you visit. After
navigating to a new page (or reloading), re-enable it from the popup. Switching
away from the tab stops the camera; switching back resumes **without** making
you recalibrate (WebGazer remembers your trained model). If you toggle it on
and see "reload this tab," the page was open before the feature was installed —
just reload and try again.

If the camera is denied, no face is detected, or the gaze engine fails to load,
the mode **fails gracefully**: it shows a brief on-page message, stops the
camera, and flips the toggle back off.

### How the gaze pipeline works

- **Gaze engine:** [WebGazer.js](https://webgazer.cs.brown.edu/) is **vendored
  locally** at `vendor/webgazer.js`. It bundles TensorFlow.js and runs on your
  **GPU via the WebGL backend**. The standalone WebGazer build normally
  *downloads* its MediaPipe **FaceMesh** + face-detector weights from
  `tfhub.dev` at runtime — which would break the offline/no-network goal — so we
  **vendored those model files** under `vendor/models/` and the content script
  installs a small `fetch` shim that redirects WebGazer's `tfhub.dev` requests to
  the local copies. **Result: nothing is fetched from the network at runtime.**
- **Camera + coordinates:** gaze runs in the **content script** on the host page,
  so WebGazer's predicted `(x, y)` are already in the page's viewport
  coordinates — no remapping needed.
- **Calibration** trains WebGazer's ridge-regression by pairing each dot's screen
  location with your eye features at click time (`recordScreenPosition`).
- **Gaze → word:** each sample is smoothed (low-pass), then
  `document.caretRangeFromPoint(x, y)` locates the text node + offset and we
  expand to word boundaries. A word must be **dwelled on** past the threshold
  before it activates.
- **Animation:** the active word is wrapped in a span of per-character `<span>`s;
  leading characters are emphasized one-by-one via `requestAnimationFrame`, sized
  by the same `bionicSplit()` used everywhere else. Emphasis uses a **synthetic
  (text-shadow) bold** so thickening a glyph **doesn't change its width** — no
  layout reflow or jitter. When your gaze moves on, the previous word is cleared
  and the DOM is restored.
- **Performance & cleanup:** gaze processing is throttled (~25 Hz), only runs in
  the **top frame** (never inside iframes), and pauses when the tab is hidden.
  Disabling stops the camera and calls `webgazer.end()`.

### Why not the NVIDIA cloud models?

This feature intentionally does **not** use NVIDIA's LocateAnything-3B / Eagle or
any multi-billion-parameter model. Those are huge server/GPU models, are **not
gaze models**, and **cannot run inside a browser extension** (no multi-GB weights,
no remote GPU, and a strict offline/CSP posture). A browser-native webcam gaze
approach (WebGazer + local FaceMesh on WebGL) is the realistic, fully-local
option and is what's used here.

## How it works (architecture)

```
            ┌──────────────┐   storage.sync (settings)   ┌────────────────────┐
            │  Popover UI  │ ──────────────────────────▶ │  Content script    │
            │  (popup.*)   │                              │  (live page edit)  │
            └──────┬───────┘                              └────────────────────┘
                   │ import file (Blob -> IndexedDB)
                   ▼
            ┌──────────────┐   reads pending file    ┌────────────────────┐
            │ Reader tab   │ ◀────────────────────── │  IndexedDB (shared │
            │ (reader.*)   │                          │  extension origin) │
            │  + pdf.js    │                          └────────────────────┘
            └──────────────┘
```

- **Content script** (`src/content.js`) walks the DOM with a `TreeWalker`, wraps
  the leading portion of each word in `<b>`, and uses a `MutationObserver` to keep
  up with dynamically loaded content. It skips code, inputs, and editable fields.
- **Popover** (`popup.*`) is the toolbar UI: a dynamic-size card with a
  **Start/Stop Reading** button for the current site, an intensity slider with a
  live preview, and a file-import dropzone.
- **Reader tab** (`reader.*`) extracts text **locally** with a bundled copy of
  `pdf.js` (for PDFs) or `Blob.text()` (for text), rebuilds paragraphs, and renders
  them with bionic formatting. The slider re-renders instantly without re-parsing.
- **Handoff:** because every page of an extension shares one origin, the popover
  stashes the imported file in **IndexedDB** and the reader picks it up - this
  avoids message-size limits for large PDFs.

## Security & privacy

This extension is intentionally minimal and self-contained:

- **No network access.** All parsing happens on your device. `pdf.js`,
  `webgazer.js`, and the FaceMesh model weights are bundled locally (`vendor/`);
  nothing is uploaded. The gaze code redirects WebGazer's would-be `tfhub.dev`
  model download to the local files, so there are **no runtime network calls**.
- **The camera never leaves your device.** Gaze estimation runs entirely in the
  browser on your GPU (WebGL). No video frames or gaze data are stored or sent.
- **No remote code.** A strict Content Security Policy (`script-src 'self'`,
  `worker-src 'self'`, `object-src 'self'`) blocks any external or inline script,
  and pdf.js runs with `isEvalSupported: false` so it never uses `eval`. The CSP
  was **not loosened** for the gaze feature: WebGazer + TensorFlow.js run inside
  the content script's **isolated world**, which is exempt from the extension
  page CSP, and the WebGL/GPU backend needs neither remote code, `eval`, nor
  WebAssembly — so no `'wasm-unsafe-eval'` (or any other relaxation) was added.
- **Least privilege.** Permissions are limited to `storage` (settings) and
  `activeTab`. There is no broad `tabs`, `scripting`, or host-read permission, and
  the content scripts only run on `http(s)` pages - never on `file://`,
  `chrome://`, or other extensions' pages. `vendor/models/*` is exposed as a
  `web_accessible_resource` only so the page's content script can read the local
  model files. Camera access uses the page's standard `getUserMedia` prompt; it
  is only ever requested when you turn Gaze Reading on.
- **Safe DOM building.** Rendered text is inserted via `createElement` /
  `textContent`, never `innerHTML` of file content, so a malicious document can't
  inject markup or scripts.
- **No data collection / telemetry.**

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this project folder (the one containing `manifest.json`).
5. The **Focus Reader** icon appears in your toolbar.

### Using it

- **Web pages:** open any article, click the icon, press **Start Reading**. Use
  the slider to tune intensity, or **Stop Reading** to pause it on that site.
- **Documents:** in the popover, drop or choose a **PDF / TXT / MD** file and click
  **Open in Reader**. A new tab opens with the formatted document. You can also
  open an empty reader and drag files onto it.

> Tip: if an on-page change doesn't appear immediately on an already-open tab,
> reload the tab. New tabs always use the latest settings.

## Files

| File                   | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `manifest.json`        | MV3 configuration, CSP, permissions.                        |
| `src/bionic.js`        | Pure `bionicSplit(word, fraction)` helper (shared).         |
| `src/content.js`       | Live page DOM traversal, word bolding, undo.                |
| `src/content.css`      | Styling for bolded portions on web pages.                   |
| `src/background.js`    | Default settings, toolbar badge, open-reader message.       |
| `src/filestore.js`     | IndexedDB handoff of imported files (shared).               |
| `src/gaze.js`          | Gaze Reading (beta): camera, calibration, gaze→word, sweep. |
| `src/gaze.css`         | Styles for the gaze sweep, calibration, and toasts.         |
| `popup.html/.css/.js`  | Toolbar popover (Start Reading, slider, gaze toggle, import).|
| `reader.html/.css/.js` | Document reader tab (PDF/text -> bionic).                    |
| `vendor/pdf.js`        | Bundled pdf.js library (local, offline).                    |
| `vendor/pdf.worker.js` | pdf.js worker.                                              |
| `vendor/webgazer.js`   | Bundled WebGazer.js gaze library (local, offline).          |
| `vendor/models/`       | Local FaceMesh + face-detector weights for WebGazer.        |
| `icons/`               | 16 / 48 / 128 px icons.                                     |
| `make_icons.py`        | Regenerates icons (optional; needs Python + Pillow).        |

## Limitations

- The reader extracts **text**, not exact PDF layout - images, columns, and
  complex tables may be simplified. The goal is comfortable linear reading.
- Scanned (image-only) PDFs have no embedded text, so there is nothing to bold.

## Regenerating icons (optional)

```bash
pip install pillow
python make_icons.py
```
