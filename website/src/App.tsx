import type { ReactNode } from "react";
import { GlassButton } from "./components/GlassButton";
import { LiquidHeader } from "./components/LiquidHeader";
import { Footer } from "./components/Footer";
import { DISPLACEMENT_MAP } from "./lib/liquidGlass";

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
    <section id={id} className="mx-auto max-w-3xl scroll-mt-24 px-6 py-24">
      <h2 className="mb-6 text-3xl font-bold tracking-tight">{title}</h2>
      <div className="text-lg leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function App() {
  return (
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

      {/* HOME / HERO */}
      <header
        id="home"
        className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center"
      >
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
          <GlassButton size="lg">Download the extension</GlassButton>
          <GlassButton size="lg" glassColor="transparent">
            View on GitHub
          </GlassButton>
        </div>
        <p className="mt-16 animate-pulse text-sm text-muted">
          Scroll to watch the menu turn liquid
        </p>
      </header>

      <main>
        <Section id="problem" title="The problem">
          <p>
            Continuous text is hard work for an ADHD brain. Long, even lines
            offer no place for the eye to lock on, so attention slips between
            words, lines blur together, and you find yourself re-reading the
            same sentence again and again just to keep your place.
          </p>
        </Section>

        <Section id="insight" title="The insight">
          <p>
            <Bionic text="Bolding the leading half of every word gives each one a fixation point. Your eye lands on the bold anchor, your brain fills in the rest, and you glide from word to word with far less effort." />
          </p>
        </Section>

        <Section id="architecture" title="The architecture">
          <p>
            Focus Reader works in two ways. A lightweight content script
            rewrites the text of any page in place, wrapping the front of each
            word in bold without touching layout or images. For longer
            material, the built-in reader takes a PDF or text file and renders
            it in a clean, focus-formatted tab - all processed locally on your
            device.
          </p>
        </Section>

        <Section id="sandbox" title="Sandbox">
          <p className="mb-6">
            Here is the effect on a live paragraph. Read it and notice how your
            eyes settle onto each bold anchor:
          </p>
          <p className="rounded-2xl border border-foreground/10 p-6 leading-relaxed">
            <Bionic text="Try reading this paragraph the way you normally would. The bold front of each word pulls your focus forward, so instead of scanning a flat wall of letters you move from anchor to anchor. A full interactive sandbox is coming soon." />
          </p>
        </Section>
      </main>

      {/* DOWNLOAD CALL-TO-ACTION (not in nav) */}
      <section
        id="download"
        className="mx-auto max-w-3xl scroll-mt-24 px-6 py-24 text-center"
      >
        <h2 className="mb-4 text-3xl font-bold tracking-tight">
          Get Focus Reader
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted">
          Add the extension to Chrome and start reading with anchors today.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <GlassButton size="lg" glassColor="transparent">
            GitHub
          </GlassButton>
          <GlassButton size="lg">Download</GlassButton>
        </div>
      </section>

      <Footer />
    </div>
  );
}
