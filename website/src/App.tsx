import { useState } from "react";
import { LiquidHeader } from "./components/LiquidHeader";
import { Footer } from "./components/Footer";
import { FileTree, type FileNode } from "./components/FileTree";
import { DocViewer } from "./components/DocViewer";
import { CursorFollowPauseProvider } from "./context/CursorFollowPause";
import { DISPLACEMENT_MAP } from "./lib/liquidGlass";

const SANDBOX_TREE: FileNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Reader.tsx", type: "file" },
          { name: "Reader.css", type: "file" },
          { name: "Toolbar.jsx", type: "file" },
          { name: "icon.svg", type: "file" },
        ],
      },
      {
        name: "lib",
        type: "folder",
        children: [
          { name: "chunker.ts", type: "file" },
          { name: "storage.ts", type: "file" },
          { name: "legacy.js", type: "file" },
        ],
      },
      { name: "main.tsx", type: "file" },
    ],
  },
  {
    name: "public",
    type: "folder",
    children: [
      { name: "manifest.json", type: "file" },
      { name: "logo.png", type: "file" },
    ],
  },
  { name: "README.md", type: "file" },
];

function Sandbox() {
  const [selected, setSelected] = useState<{ path: string; name: string }>();

  return (
    <section id="sandbox" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Sandbox
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Browse the explorer and open a file to preview its document.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <FileTree
              tree={SANDBOX_TREE}
              selectedPath={selected?.path}
              onSelectFile={(node, path) =>
                setSelected({ path, name: node.name })
              }
            />
          </div>
          <DocViewer
            selectedPath={selected?.path}
            selectedName={selected?.name}
          />
        </div>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <CursorFollowPauseProvider>
      <div className="min-h-screen">
        {/* Single shared refraction filter used by every .liquid-surface */}
        <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
          <filter id="liquid-global" primitiveUnits="objectBoundingBox">
            <feImage
              result="map"
              width="100%"
              height="100%"
              x="0"
              y="0"
              href={DISPLACEMENT_MAP}
              preserveAspectRatio="none"
            />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
            <feDisplacementMap
              in="blur"
              in2="map"
              scale="0.12"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>

        <LiquidHeader />

        <main className="pt-[100vh]">
          <Sandbox />
        </main>

        <Footer />
      </div>
    </CursorFollowPauseProvider>
  );
}
