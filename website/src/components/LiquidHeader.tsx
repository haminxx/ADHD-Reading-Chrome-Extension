import { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  type Transition,
} from "framer-motion";
import { useCursorFollowPause, usePauseZoneHandlers } from "@/context/CursorFollowPause";
import { NAV_ITEMS, downloadExtension, openGitHub } from "@/lib/config";

// "bar"    = full header (left nav pill + right actions pill) pinned at top
// "island" = left pill collapsed into a black pill that springs to the cursor
// "card"   = island expanded (FLIP via layoutId) into a brutalist menu card
type Mode = "bar" | "island" | "card";

const SCROLL_THRESHOLD = 90;

// Bouncy spring used for every dimensional/positional change (no linear easing).
const SPRING: Transition = { type: "spring", stiffness: 320, damping: 26, mass: 0.9 };
const FOLLOW_SPRING = { stiffness: 150, damping: 15, mass: 0.6 };
const SNAP_SPRING = { stiffness: 520, damping: 30, mass: 0.45 };

function scrollToId(href: string) {
  if (href.startsWith("#")) {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  }
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black ${
        dark ? "bg-white text-black" : "bg-foreground text-background"
      }`}
    >
      F
    </span>
  );
}

export function LiquidHeader() {
  const [mode, setMode] = useState<Mode>("bar");
  const { isPaused } = useCursorFollowPause();
  const pauseZone = usePauseZoneHandlers();
  const isPausedRef = useRef(isPaused);
  const wasPausedRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 40 });

  // Cursor position -> spring-smoothed values that drive the island.
  const mouseX = useMotionValue(
    typeof window !== "undefined" ? window.innerWidth / 2 : 0
  );
  const mouseY = useMotionValue(40);
  const [followSpring, setFollowSpring] = useState(FOLLOW_SPRING);
  const springX = useSpring(mouseX, followSpring);
  const springY = useSpring(mouseY, followSpring);

  isPausedRef.current = isPaused;

  useEffect(() => {
    const onScroll = () => {
      setMode((m) =>
        m === "card" ? m : window.scrollY > SCROLL_THRESHOLD ? "island" : "bar"
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      if (!isPausedRef.current) {
        mouseX.set(e.clientX);
        mouseY.set(e.clientY);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  // Quick spring snap to cursor when leaving a pause zone (island mode only).
  useEffect(() => {
    const wasPaused = wasPausedRef.current;
    wasPausedRef.current = isPaused;

    if (wasPaused && !isPaused && mode === "island") {
      const { x, y } = lastMouseRef.current;
      setFollowSpring(SNAP_SPRING);
      mouseX.set(x);
      mouseY.set(y);
      const timer = window.setTimeout(() => setFollowSpring(FOLLOW_SPRING), 380);
      return () => window.clearTimeout(timer);
    }
  }, [isPaused, mode, mouseX, mouseY]);

  const closeCard = () =>
    setMode(window.scrollY > SCROLL_THRESHOLD ? "island" : "bar");

  return (
    <>
      {/* Gooey / metaball filter: blurs then re-sharpens alpha so the
          notification dot melts into the island like a viscous liquid. */}
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
        <filter id="gooey">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="goo"
          />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </svg>

      {/* RIGHT ACTIONS PILL - stays pinned top-right in bar + island modes */}
      <AnimatePresence>
        {mode !== "card" && (
          <motion.div
            key="actions"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={SPRING}
            className="fixed right-4 top-4 z-40"
            {...pauseZone}
          >
            <div className="liquid-surface flex items-center gap-1 rounded-full p-1.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={openGitHub}
                className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:text-foreground"
              >
                GitHub
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={downloadExtension}
                className="rounded-full bg-foreground px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-background"
              >
                Download
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT NAV PILL (bar mode) */}
      <AnimatePresence>
        {mode === "bar" && (
          <motion.header
            key="bar"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0, scale: 0.9 }}
            transition={SPRING}
            className="fixed left-4 top-4 z-40"
            {...pauseZone}
          >
            <div className="liquid-surface flex items-center gap-1 rounded-full py-1.5 pl-2 pr-3">
              <span className="px-1">
                <Logo />
              </span>
              <nav className="flex items-center">
                {NAV_ITEMS.map((item) => (
                  <motion.button
                    key={item.label}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => scrollToId(item.href)}
                    className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </motion.button>
                ))}
              </nav>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* COLLAPSED ISLAND (island mode) - follows the cursor */}
      <AnimatePresence>
        {mode === "island" && (
          <motion.div
            key="island"
            className="pointer-events-none fixed left-0 top-0 z-50"
            style={{ x: springX, y: springY }}
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              {/* Gooey background layer (only solid black shapes live here) */}
              <div className="relative" style={{ filter: "url(#gooey)" }}>
                {/* notification dot that slides in and melts into the pill */}
                <motion.span
                  className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-black"
                  initial={{ x: -26, opacity: 0 }}
                  animate={{ x: 10, opacity: 1 }}
                  exit={{ x: -26, opacity: 0 }}
                  transition={{ ...SPRING, delay: 0.04 }}
                />
                <motion.div
                  layoutId="hud-bg"
                  className="h-12 w-28 rounded-full bg-black"
                  // Squash & stretch: born wide/short, snaps to shape.
                  initial={{ scaleX: 1.25, scaleY: 0.7, opacity: 0 }}
                  animate={{ scaleX: 1, scaleY: 1, opacity: 1 }}
                  exit={{ scaleX: 1.2, scaleY: 0.7, opacity: 0 }}
                  transition={SPRING}
                />
              </div>

              {/* Crisp content overlay (kept out of the gooey filter) */}
              <motion.button
                onClick={() => setMode("card")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                aria-label="Open menu"
                className="pointer-events-auto absolute inset-0 flex items-center justify-center gap-2"
              >
                <Logo dark />
                <span className="flex flex-col gap-[3px]">
                  <span className="block h-[2px] w-4 rounded bg-white" />
                  <span className="block h-[2px] w-4 rounded bg-white" />
                  <span className="block h-[2px] w-4 rounded bg-white" />
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXPANDED MENU CARD (card mode) - morphs from the island via layoutId */}
      <AnimatePresence>
        {mode === "card" && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCard}
            />
            <motion.div
              key="card"
              layoutId="hud-bg"
              transition={SPRING}
              className="fixed left-4 top-4 z-50 w-[min(92vw,360px)] overflow-hidden rounded-[28px] bg-black p-5 text-white"
              {...pauseZone}
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.2 }}
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Logo dark />
                    <span className="font-bold tracking-tight">Focus Reader</span>
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={closeCard}
                    aria-label="Close menu"
                    className="grid h-8 w-8 place-items-center rounded-full text-lg text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    &times;
                  </motion.button>
                </div>

                <nav className="grid">
                  {NAV_ITEMS.map((item) => (
                    <motion.button
                      key={item.label}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        scrollToId(item.href);
                        closeCard();
                      }}
                      className="rounded-xl px-3 py-3 text-left text-sm font-semibold uppercase tracking-[0.12em] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {item.label}
                    </motion.button>
                  ))}
                </nav>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={openGitHub}
                    className="rounded-full border border-white/25 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white"
                  >
                    GitHub
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={downloadExtension}
                    className="rounded-full bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-black"
                  >
                    Download
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
