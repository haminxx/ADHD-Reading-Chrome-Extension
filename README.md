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

- **No network access.** All parsing happens on your device. `pdf.js` is bundled
  locally (`vendor/`); nothing is uploaded.
- **No remote code.** A strict Content Security Policy (`script-src 'self'`,
  `worker-src 'self'`, `object-src 'self'`) blocks any external or inline script,
  and pdf.js runs with `isEvalSupported: false` so it never uses `eval`.
- **Least privilege.** Permissions are limited to `storage` (settings) and
  `activeTab`. There is no broad `tabs`, `scripting`, or host-read permission, and
  the content script only runs on `http(s)` pages - never on `file://`,
  `chrome://`, or other extensions' pages.
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
| `popup.html/.css/.js`  | Toolbar popover (Start Reading, slider, import).            |
| `reader.html/.css/.js` | Document reader tab (PDF/text -> bionic).                    |
| `vendor/pdf.js`        | Bundled pdf.js library (local, offline).                    |
| `vendor/pdf.worker.js` | pdf.js worker.                                              |
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
