# Focus Reader - ADHD Bionic Reading

This repository has two parts:

| Folder        | What it is                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| `extension/`  | The Chrome extension (Manifest V3). All current functionality lives here.  |
| `website/`    | The landing/download website where users can learn about and download the extension. Empty for now. |

## Chrome extension

See [`extension/README.md`](extension/README.md) for full details, features, and
security notes.

Quick start (developer mode):

1. Go to `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.

Or download a packaged build from the
[Releases page](https://github.com/haminxx/ADHD-Reading-Chrome-Extension/releases).

## Website

`website/` is intentionally empty for now. It will host the public download page
for the extension.

## Releases

Pushing a version tag (e.g. `v1.2.0`) triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which zips the
`extension/` folder and publishes it as a downloadable release asset.
