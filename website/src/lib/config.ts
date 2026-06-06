export const REPO_URL = "https://github.com/haminxx/ADHD-Reading-Chrome-Extension";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;

/** Served from website/public/ — built by `npm run pack-extension`. */
export const EXTENSION_ZIP_URL = "/focus-reader-extension.zip";
export const EXTENSION_ZIP_FILENAME = "focus-reader-extension.zip";

export function openGitHub() {
  window.open(REPO_URL, "_blank", "noopener,noreferrer");
}

export function downloadExtension() {
  const a = document.createElement("a");
  a.href = EXTENSION_ZIP_URL;
  a.download = EXTENSION_ZIP_FILENAME;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const NAV_ITEMS = [
  { label: "Home", href: "#home" },
  { label: "Problem", href: "#problem" },
  { label: "Insight", href: "#insight" },
  { label: "Architecture", href: "#architecture" },
  { label: "Sandbox", href: "#sandbox" },
];
