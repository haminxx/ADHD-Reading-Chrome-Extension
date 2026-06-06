import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type FileNode = {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
};

interface FileTreeProps {
  tree: FileNode[];
  selectedPath?: string;
  onSelectFile?: (node: FileNode, path: string) => void;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  path: string;
  selectedPath?: string;
  onSelectFile?: (node: FileNode, path: string) => void;
}

const ACCENT = "oklch(0.62 0.19 264)";

/** Per-extension icon glyph + color. Arbitrary OKLCH values are kept as-is. */
function getFileIcon(name: string): { glyph: string; className: string } {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "tsx":
      return { glyph: "TSX", className: "text-[oklch(0.65_0.18_220)]" };
    case "ts":
      return { glyph: "TS", className: "text-[oklch(0.6_0.16_250)]" };
    case "jsx":
      return { glyph: "JSX", className: "text-[oklch(0.74_0.16_85)]" };
    case "js":
      return { glyph: "JS", className: "text-[oklch(0.8_0.16_95)]" };
    case "css":
      return { glyph: "CSS", className: "text-[oklch(0.62_0.2_25)]" };
    case "json":
      return { glyph: "{ }", className: "text-[oklch(0.78_0.15_120)]" };
    case "md":
      return { glyph: "MD", className: "text-[oklch(0.7_0.02_270)]" };
    case "svg":
      return { glyph: "SVG", className: "text-[oklch(0.66_0.19_320)]" };
    case "png":
      return { glyph: "PNG", className: "text-[oklch(0.68_0.16_180)]" };
    default:
      return { glyph: "•", className: "text-foreground/50" };
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-foreground/45"
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <path d="M9 6l6 6-6 6" />
    </motion.svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0 text-[oklch(0.78_0.16_85)]"
      aria-hidden="true"
    >
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function FileItem({ node, depth, path, selectedPath, onSelectFile }: FileItemProps) {
  const isFolder = node.type === "folder";
  const [open, setOpen] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const isSelected = !isFolder && selectedPath === path;
  const fileIcon = isFolder ? null : getFileIcon(node.name);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) {
            setOpen((o) => !o);
          } else {
            onSelectFile?.(node, path);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
          isSelected
            ? "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-[oklch(0.62_0.19_264)]"
            : "text-foreground/80 hover:bg-foreground/5"
        )}
      >
        {/* expand/collapse chevron (folders) or spacer (files) */}
        {isFolder ? (
          <ChevronIcon open={open} />
        ) : (
          <span className="inline-block w-3 shrink-0" />
        )}

        {isFolder ? (
          <FolderIcon />
        ) : (
          <span
            className={cn(
              "w-7 shrink-0 text-[9px] font-bold tabular-nums tracking-tight",
              fileIcon?.className
            )}
          >
            {fileIcon?.glyph}
          </span>
        )}

        <span className="truncate">{node.name}</span>

        {/* hover indicator dot */}
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-150",
            isSelected
              ? "opacity-100 bg-[oklch(0.62_0.19_264)]"
              : hovered
              ? "opacity-100 bg-foreground/30"
              : "opacity-0"
          )}
          style={isSelected ? { backgroundColor: ACCENT } : undefined}
        />
      </button>

      {/* animated children container (max-height collapse) */}
      {isFolder && node.children && (
        <motion.div
          initial={false}
          animate={{
            height: open ? "auto" : 0,
            opacity: open ? 1 : 0,
          }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="space-y-0.5 pt-0.5">
            {node.children.map((child) => (
              <FileItem
                key={`${path}/${child.name}`}
                node={child}
                depth={depth + 1}
                path={`${path}/${child.name}`}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function FileTree({ tree, selectedPath, onSelectFile }: FileTreeProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10 bg-[color-mix(in_srgb,var(--foreground)_5%,var(--background))]">
      {/* traffic-light header + explorer label */}
      <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[oklch(0.7_0.18_25)]" />
          <span className="h-3 w-3 rounded-full bg-[oklch(0.82_0.16_85)]" />
          <span className="h-3 w-3 rounded-full bg-[oklch(0.78_0.15_145)]" />
        </span>
        <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          explorer
        </span>
      </div>

      <div className="space-y-0.5 p-2">
        {tree.map((node) => (
          <FileItem
            key={node.name}
            node={node}
            depth={0}
            path={node.name}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}
