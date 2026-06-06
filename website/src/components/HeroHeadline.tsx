import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

const SENTENCE =
  "Average digital attention span collapses after exactly 47 seconds to trigger subconscious self-interruption, a silent habit of losing focus that turns daily reading into cognitive exhaustion";

// Cadence (ms per character) for each phase. Kept snappy so the whole sequence
// stays under ~7s on the long sentence above.
const TYPE_MS = 22;
const BOLD_MS = 13;

// Faux-bold via a mirrored text-shadow so toggling weight never reflows the
// text (mirrors the technique the Chrome extension uses for its bionic style).
const FAUX_BOLD =
  "0.022em 0 0 currentColor, -0.022em 0 0 currentColor";

// Bionic rule: for each contiguous run of letters/digits (a "word"), the
// leading ceil(n/2) characters are bold. Punctuation and spaces are skipped.
function computeBoldMask(text: string): boolean[] {
  const mask = new Array<boolean>(text.length).fill(false);
  const isWordChar = (c: string) => /[A-Za-z0-9]/.test(c);
  let i = 0;
  while (i < text.length) {
    if (!isWordChar(text[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && isWordChar(text[j])) j += 1;
    const boldCount = Math.ceil((j - i) / 2);
    for (let k = 0; k < boldCount; k += 1) mask[i + k] = true;
    i = j;
  }
  return mask;
}

const BOLD_MASK = computeBoldMask(SENTENCE);
const CHARS = SENTENCE.split("");

type Phase = "idle" | "typing" | "bolding" | "done";

function Caret() {
  return (
    <motion.span
      aria-hidden="true"
      className="ml-[0.04em] inline-block h-[0.92em] w-[2px] translate-y-[0.12em] rounded-[1px] bg-foreground align-baseline"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1], ease: "linear" }}
    />
  );
}

export function HeroHeadline() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  const [typed, setTyped] = useState(0);
  const [boldSweep, setBoldSweep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  // Reduced motion: jump straight to the final, fully-bolded sentence.
  useEffect(() => {
    if (!reduceMotion) return;
    setTyped(CHARS.length);
    setBoldSweep(CHARS.length);
    setPhase("done");
  }, [reduceMotion]);

  // Kick off the sequence once the hero scrolls into view.
  useEffect(() => {
    if (reduceMotion || !inView) return;
    setPhase((p) => (p === "idle" ? "typing" : p));
  }, [inView, reduceMotion]);

  // Phase 1 - typewriter reveal, one character per tick.
  useEffect(() => {
    if (phase !== "typing") return;
    if (typed >= CHARS.length) {
      setPhase("bolding");
      return;
    }
    const t = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => window.clearTimeout(t);
  }, [phase, typed]);

  // Phase 2 - left-to-right bionic sweep, one character per tick.
  useEffect(() => {
    if (phase !== "bolding") return;
    if (boldSweep >= CHARS.length) {
      setPhase("done");
      return;
    }
    const t = window.setTimeout(() => setBoldSweep((n) => n + 1), BOLD_MS);
    return () => window.clearTimeout(t);
  }, [phase, boldSweep]);

  const showCaret = phase === "typing";

  // Build the inline run. Every character is rendered up front (hidden via
  // opacity) so the full text block reserves its space immediately and the
  // typing/bolding never causes the hero to reflow.
  const content: ReactNode[] = [];
  CHARS.forEach((ch, i) => {
    if (showCaret && i === typed) content.push(<Caret key="caret" />);
    const visible = i < typed;
    const bold = BOLD_MASK[i] && i < boldSweep;
    content.push(
      <span
        key={i}
        style={{
          opacity: visible ? 1 : 0,
          textShadow: bold ? FAUX_BOLD : undefined,
          transition: "text-shadow 140ms ease-out",
        }}
      >
        {ch}
      </span>
    );
  });
  if (showCaret && typed >= CHARS.length) content.push(<Caret key="caret" />);

  return (
    <h1
      ref={ref}
      className="mx-auto max-w-3xl text-balance text-center text-3xl font-normal leading-snug tracking-tight text-foreground sm:text-4xl md:text-5xl"
    >
      {content}
    </h1>
  );
}
