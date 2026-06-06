import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CursorFollowPauseContextValue = {
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
};

const CursorFollowPauseContext =
  createContext<CursorFollowPauseContextValue | null>(null);

export function CursorFollowPauseProvider({ children }: { children: ReactNode }) {
  const pauseCountRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const pause = useCallback(() => {
    pauseCountRef.current += 1;
    if (pauseCountRef.current === 1) setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    pauseCountRef.current = Math.max(0, pauseCountRef.current - 1);
    if (pauseCountRef.current === 0) setIsPaused(false);
  }, []);

  return (
    <CursorFollowPauseContext.Provider value={{ isPaused, pause, resume }}>
      {children}
    </CursorFollowPauseContext.Provider>
  );
}

export function useCursorFollowPause() {
  const ctx = useContext(CursorFollowPauseContext);
  if (!ctx) {
    throw new Error("useCursorFollowPause must be used within CursorFollowPauseProvider");
  }
  return ctx;
}

/** Attach to header/footer zones so the island stops following the cursor on hover. */
export function usePauseZoneHandlers() {
  const { pause, resume } = useCursorFollowPause();
  return { onMouseEnter: pause, onMouseLeave: resume };
}
