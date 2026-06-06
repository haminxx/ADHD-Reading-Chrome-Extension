import { AnimatePresence, motion } from "framer-motion";

export type DocContent = {
  title: string;
  subtitle?: string;
  paragraphs: string[];
};

/**
 * In-repo dataset mapping a file path -> document content. Paths mirror the
 * sample tree wired up in App. Files without an entry fall back to
 * `defaultDoc(name)`.
 */
export const DOCS: Record<string, DocContent> = {
  "src/components/Reader.tsx": {
    title: "Reader.tsx",
    subtitle: "React component · presentation layer",
    paragraphs: [
      "The Reader component is the heart of the focus experience. It receives a parsed document stream and renders one chunk at a time, dimming the surrounding context so the eye is gently pulled toward the active line.",
      "State is intentionally minimal: a cursor index, a play/pause flag, and a words-per-minute target. Everything else is derived, which keeps re-renders cheap even on long-form articles.",
      "Keyboard handlers map space to pause, arrow keys to step, and bracket keys to nudge speed. The goal is a tactile, low-friction control surface that never breaks the reader's flow.",
    ],
  },
  "src/components/Reader.css": {
    title: "Reader.css",
    subtitle: "Stylesheet · typography & focus states",
    paragraphs: [
      "These styles define the reading column: a comfortable measure of roughly 60 characters, generous line height, and a vertical rhythm tuned for sustained attention.",
      "The active-line treatment uses a soft highlight rather than a hard box, which testing showed is far less fatiguing across long sessions.",
      "Reduced-motion preferences are respected here, collapsing the fade transitions into instant swaps for readers who need them.",
    ],
  },
  "src/lib/chunker.ts": {
    title: "chunker.ts",
    subtitle: "TypeScript module · text segmentation",
    paragraphs: [
      "The chunker splits raw text into readable units. It is sentence-aware first, then falls back to clause and word boundaries when a sentence runs long enough to overwhelm working memory.",
      "Abbreviations, decimals, and ellipses are guarded against so the segmenter does not mistake a period for the end of a thought.",
      "Output is a flat array of chunks with character offsets, which lets the Reader scrub backward and forward without re-parsing the source.",
    ],
  },
  "src/lib/storage.ts": {
    title: "storage.ts",
    subtitle: "TypeScript module · persistence",
    paragraphs: [
      "A thin wrapper over the extension storage API. It persists per-user preferences — speed, theme, and the position within each saved document.",
      "Writes are debounced so rapid speed adjustments don't thrash the underlying quota, and reads are memoized for the lifetime of a session.",
      "Everything is namespaced under a single versioned key, which makes future migrations a single, testable transform.",
    ],
  },
  "public/manifest.json": {
    title: "manifest.json",
    subtitle: "Configuration · extension manifest",
    paragraphs: [
      "The manifest declares the extension to the browser: its name, version, permissions, and the content scripts that wake it up on the page.",
      "Permissions are deliberately narrow — active tab and storage only — so the extension asks for the minimum trust required to do its job.",
      "Content scripts are scoped to document-idle so injection never blocks the host page's first paint.",
    ],
  },
  "README.md": {
    title: "README.md",
    subtitle: "Documentation · project overview",
    paragraphs: [
      "Focus Reader is a reading aid built for ADHD brains. It strips a page down to a single moving focus point, turning a wall of text into a calm, paced stream.",
      "This repository contains the browser extension, a shared parsing library, and the marketing site you are looking at right now.",
      "Start with the contributing guide, run the dev server, and load the unpacked extension to see changes live as you edit.",
    ],
  },
};

function defaultDoc(name: string): DocContent {
  return {
    title: name,
    subtitle: "Untitled document",
    paragraphs: [
      `This is a placeholder document for ${name}. No dedicated content has been authored for this file yet, so you are seeing the default page.`,
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur a sapien vitae justo dignissim aliquet. Integer feugiat, nibh ut ornare tincidunt, lorem nisl porttitor arcu.",
      "Select another file from the explorer on the left to swap this page for its document.",
    ],
  };
}

interface DocViewerProps {
  /** Full path of the selected file, or undefined when nothing is selected. */
  selectedPath?: string;
  /** Display name of the selected file (leaf). */
  selectedName?: string;
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-foreground/20 p-10 text-center">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-4 text-foreground/30"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <p className="text-sm font-medium text-foreground/70">No file selected</p>
      <p className="mt-1 max-w-xs text-sm text-muted">
        Pick a file from the explorer to preview its document here.
      </p>
    </div>
  );
}

export function DocViewer({ selectedPath, selectedName }: DocViewerProps) {
  if (!selectedPath || !selectedName) {
    return <EmptyState />;
  }

  const doc = DOCS[selectedPath] ?? defaultDoc(selectedName);

  return (
    <div className="rounded-xl border border-foreground/10 bg-[color-mix(in_srgb,var(--foreground)_4%,var(--background))] p-4 sm:p-8">
      <AnimatePresence mode="wait">
        <motion.article
          key={selectedPath}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="mx-auto w-full max-w-[640px]"
        >
          {/* PDF-style white paper sheet */}
          <div className="relative rounded-md bg-white px-7 py-10 text-neutral-800 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5 sm:px-12 sm:py-14">
            <header className="mb-8 border-b border-neutral-200 pb-6">
              <h3 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                {doc.title}
              </h3>
              {doc.subtitle && (
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.14em] text-neutral-400">
                  {doc.subtitle}
                </p>
              )}
            </header>

            <div className="space-y-5">
              {doc.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="text-[15px] leading-7 text-neutral-700 first-letter:text-neutral-900"
                >
                  {p}
                </p>
              ))}
            </div>

            {/* faux page number */}
            <footer className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-5 text-xs text-neutral-400">
              <span className="truncate">{selectedPath}</span>
              <span className="shrink-0">Page 1 of 1</span>
            </footer>
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}
