import { LiquidHeader } from "./components/LiquidHeader";
import { Footer } from "./components/Footer";
import { CursorFollowPauseProvider } from "./context/CursorFollowPause";
import { DISPLACEMENT_MAP } from "./lib/liquidGlass";

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

        <main className="min-h-[200vh]" aria-hidden="true" />

        <Footer />
      </div>
    </CursorFollowPauseProvider>
  );
}
