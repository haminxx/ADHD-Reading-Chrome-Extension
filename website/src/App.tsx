import type { ReactNode } from "react";
import { GlassButton } from "./components/GlassButton";
import { LiquidHeader } from "./components/LiquidHeader";
import { DISPLACEMENT_MAP } from "./lib/liquidGlass";
import { LATEST_RELEASE_URL, REPO_URL } from "./lib/config";

// Renders a word with its leading half bold, matching the extension's effect.
function Bionic({ text }: { text: string }) {
  const tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];
  return (
    <>
      {tokens.map((tok, i) => {
        if (/[\p{L}\p{N}]/u.test(tok)) {
          const n = Math.ceil(tok.length / 2);
          return (
            <span key={i}>
              <b>{tok.slice(0, n)}</b>
              {tok.slice(n)}
            </span>
          );
        }
        return <span key={i}>{tok}</span>;
      })}
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="mb-6 text-3xl font-bold tracking-tight">{title}</h2>
      <div className="text-lg leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function App() {
  const open = (url: string) =>
    window.open(url, "_blank", "noopener,noreferrer");

  return (
    <div id="top" className="min-h-screen">
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

      {/* HERO */}
      <header className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, oklch(0.7 0.15 264 / 0.25), transparent 70%)",
          }}
        />
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          ADHD Bionic Reading
        </p>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Read with less effort.
        </h1>
        <p className="mt-6 max-w-xl text-xl leading-relaxed text-muted">
          <Bionic text="Focus Reader bolds the leading half of every word, giving your eyes an anchor on each one so you can keep your place and your focus." />
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <GlassButton size="lg" onClick={() => open(LATEST_RELEASE_URL)}>
            Download the extension
          </GlassButton>
          <GlassButton
            size="lg"
            glassColor="transparent"
            onClick={() => open(REPO_URL)}
          >
            View on GitHub
          </GlassButton>
        </div>
        <p className="mt-16 animate-pulse text-sm text-muted">
          Scroll to watch the menu turn liquid
        </p>
      </header>

      <main>
        <Section id="features" title="Features">
          <ul className="list-disc space-y-2 pl-5">
            <li>Bolds the front half of every word to anchor attention.</li>
            <li>Works live on any web page with a one-click toggle.</li>
            <li>Import a PDF or text file into a focus-formatted reader tab.</li>
            <li>Adjustable intensity, fully local, no data collection.</li>
          </ul>
        </Section>

        <Section id="how" title="How it works">
          <p>
            The extension rewrites page text so the first few letters of each
            word are bold. That bold "fixation point" helps many readers with
            ADHD glide from word to word with less re-reading.
          </p>
        </Section>

        <Section id="reader" title="Document reader">
          <p>
            Drop a PDF or text file into the popover and it opens in a clean
            reader tab, processed entirely on your device.
          </p>
        </Section>

        <Section id="faq" title="FAQ">
          <p>
            More details, screenshots, and install instructions will live here.
            This page is an early scaffold - the header design and menu card are
            ready for your upcoming instructions.
          </p>
        </Section>
      </main>

      <footer className="border-t border-foreground/10 px-6 py-10 text-center text-sm text-muted">
        Focus Reader - ADHD Bionic Reading.{" "}
        <button className="underline" onClick={() => open(REPO_URL)}>
          Source on GitHub
        </button>
      </footer>
    </div>
  );
}
