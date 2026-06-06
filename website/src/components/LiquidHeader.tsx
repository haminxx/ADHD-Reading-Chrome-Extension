import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { GlassButton } from "./GlassButton";
import { LATEST_RELEASE_URL, NAV_ITEMS } from "@/lib/config";

// "bar"  = full header pinned at the top of the page
// "blob" = collapsed liquid blob that springs toward the cursor
// "card" = expanded floating/static menu card (opened by clicking the blob)
type Mode = "bar" | "blob" | "card";

// Organic border-radius keyframes -> the morphing "liquid" silhouette.
const MORPH_RADII = [
  "42% 58% 70% 30% / 45% 45% 55% 55%",
  "67% 33% 47% 53% / 37% 51% 49% 63%",
  "39% 61% 38% 62% / 58% 41% 59% 42%",
  "55% 45% 57% 43% / 49% 57% 43% 51%",
  "42% 58% 70% 30% / 45% 45% 55% 55%",
];

const SCROLL_THRESHOLD = 90;

function go(href: string) {
  if (href.startsWith("#")) {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

export function LiquidHeader() {
  const [mode, setMode] = useState<Mode>("bar");

  // Cursor position -> spring-smoothed values that drive the blob.
  const mouseX = useMotionValue(
    typeof window !== "undefined" ? window.innerWidth / 2 : 0
  );
  const mouseY = useMotionValue(40);
  const springX = useSpring(mouseX, { stiffness: 130, damping: 14, mass: 0.6 });
  const springY = useSpring(mouseY, { stiffness: 130, damping: 14, mass: 0.6 });

  // Collapse to a blob when scrolled (unless a card is currently open).
  useEffect(() => {
    const onScroll = () => {
      setMode((m) =>
        m === "card" ? m : window.scrollY > SCROLL_THRESHOLD ? "blob" : "bar"
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Track the cursor for the liquid blob.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  const closeCard = () =>
    setMode(window.scrollY > SCROLL_THRESHOLD ? "blob" : "bar");

  return (
    <>
      {/* FULL TOP BAR */}
      <AnimatePresence>
        {mode === "bar" && (
          <motion.header
            key="bar"
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            className="fixed inset-x-0 top-0 z-40 flex justify-center p-4"
          >
            <div className="liquid-surface flex w-full max-w-4xl items-center justify-between rounded-full px-4 py-2.5">
              <button
                onClick={() => go("#top")}
                className="px-2 font-bold tracking-tight"
              >
                Focus Reader
              </button>
              <nav className="hidden items-center gap-1 md:flex">
                {NAV_ITEMS.map((item) => (
                  <GlassButton
                    key={item.label}
                    size="sm"
                    glassColor="transparent"
                    onClick={() => go(item.href)}
                  >
                    {item.label}
                  </GlassButton>
                ))}
              </nav>
              <GlassButton size="sm" onClick={() => go(LATEST_RELEASE_URL)}>
                Download
              </GlassButton>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* CURSOR-FOLLOWING LIQUID BLOB */}
      <AnimatePresence>
        {mode === "blob" && (
          <motion.div
            key="blob"
            className="pointer-events-none fixed left-0 top-0 z-50"
            style={{ x: springX, y: springY }}
          >
            <motion.button
              onClick={() => setMode("card")}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, borderRadius: MORPH_RADII }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                scale: { type: "spring", stiffness: 260, damping: 18 },
                opacity: { duration: 0.2 },
                borderRadius: { duration: 8, repeat: Infinity, ease: "easeInOut" },
              }}
              aria-label="Open menu"
              className="liquid-surface pointer-events-auto grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center"
            >
              <span className="flex flex-col gap-[3px]">
                <span className="block h-[2px] w-5 rounded bg-current" />
                <span className="block h-[2px] w-5 rounded bg-current" />
                <span className="block h-[2px] w-5 rounded bg-current" />
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXPANDED MENU CARD (floating -> settles into a static header card) */}
      <AnimatePresence>
        {mode === "card" && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-black/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCard}
            />
            <motion.div
              key="card"
              className="fixed inset-x-0 top-0 z-50 flex justify-center p-4"
              initial={{ y: -24, opacity: 0, scale: 0.92, borderRadius: 40 }}
              animate={{ y: 0, opacity: 1, scale: 1, borderRadius: 28 }}
              exit={{ y: -24, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 230, damping: 22 }}
            >
              <div className="liquid-surface w-full max-w-md rounded-[28px] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="px-1 font-bold tracking-tight">Focus Reader</span>
                  <GlassButton
                    size="icon"
                    aria-label="Close menu"
                    onClick={closeCard}
                  >
                    &times;
                  </GlassButton>
                </div>

                <nav className="grid gap-2">
                  {NAV_ITEMS.map((item) => (
                    <GlassButton
                      key={item.label}
                      size="sm"
                      glassColor="transparent"
                      contentClassName="justify-start"
                      className="w-full !justify-start text-left"
                      onClick={() => {
                        go(item.href);
                        closeCard();
                      }}
                    >
                      {item.label}
                    </GlassButton>
                  ))}
                </nav>

                <div className="mt-4">
                  <GlassButton
                    className="w-full"
                    onClick={() => go(LATEST_RELEASE_URL)}
                  >
                    Download the extension
                  </GlassButton>
                </div>

                <p className="mt-3 text-center text-xs text-muted">
                  More menu options coming soon.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
