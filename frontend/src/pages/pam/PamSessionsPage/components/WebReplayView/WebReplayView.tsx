import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TWebFrameEvent } from "@app/hooks/api/pam/session-playback/types";

import { WebReplayPlayer } from "./webReplayPlayer";

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = r.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const OUTER_ASPECT_W = 16;
const OUTER_ASPECT_H = 9;

type Props = {
  events: unknown[];
  isStreaming?: boolean;
};

export const WebReplayView = ({ events, isStreaming = false }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<WebReplayPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const wallStartRef = useRef<number | null>(null);
  const clockMsRef = useRef(0);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [totalMs, setTotalMs] = useState(0);
  const [feedback, setFeedback] = useState<{ icon: "play" | "pause"; nonce: number } | null>(null);

  const totalMsRef = useRef(totalMs);
  totalMsRef.current = totalMs;

  const writeProgress = (ms: number) => {
    clockMsRef.current = ms;
    const total = totalMsRef.current;
    if (progressFillRef.current) {
      const pct = total > 0 ? Math.min(1, ms / total) * 100 : 0;
      progressFillRef.current.style.width = `${pct}%`;
    }
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${formatMs(ms)} / ${formatMs(total)}`;
    }
  };

  // Initialise player once canvas is available
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    playerRef.current = new WebReplayPlayer(ctx);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      playerRef.current = null;
    };
  }, []);

  // Feed new frames whenever events change
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const frames = events.filter(
      (e): e is TWebFrameEvent =>
        typeof e === "object" && e !== null && (e as Record<string, unknown>).type === "web_frame"
    );
    player.setFrames(frames);
    setTotalMs(player.totalMs);
  }, [events, isStreaming]);

  // RAF tick
  const startTick = () => {
    if (rafRef.current !== null) return;
    wallStartRef.current = performance.now() - clockMsRef.current;

    const tick = () => {
      const player = playerRef.current;
      if (!player || wallStartRef.current === null) return;
      const now = performance.now();
      const ms = now - wallStartRef.current;
      clockMsRef.current = ms;
      writeProgress(ms);
      player.drawAt(ms).catch(() => {});

      if (ms >= player.totalMs && player.totalMs > 0 && !isStreaming) {
        rafRef.current = null;
        wallStartRef.current = null;
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const stopTick = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    wallStartRef.current = null;
  };

  const onPlayPause = () => {
    if (isPlaying) {
      stopTick();
      setIsPlaying(false);
      setFeedback({ icon: "pause", nonce: Date.now() });
    } else {
      // Auto-restart if at end
      if (
        playerRef.current &&
        clockMsRef.current >= playerRef.current.totalMs &&
        playerRef.current.totalMs > 0
      ) {
        clockMsRef.current = 0;
        writeProgress(0);
      }
      startTick();
      setIsPlaying(true);
      setFeedback({ icon: "play", nonce: Date.now() });
    }
  };

  const onRestart = () => {
    stopTick();
    clockMsRef.current = 0;
    writeProgress(0);
    setIsPlaying(false);
    // Draw first frame
    playerRef.current?.drawAt(0).catch(() => {});
  };

  useEffect(() => {
    if (!feedback) return undefined;
    const t = setTimeout(() => setFeedback(null), 400);
    return () => clearTimeout(t);
  }, [feedback]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-black focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none"
        style={{ aspectRatio: `${OUTER_ASPECT_W} / ${OUTER_ASPECT_H}` }}
      >
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
          aria-label="Web page session replay"
        />
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback.nonce}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="flex size-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                {feedback.icon === "play" ? (
                  <PlayIcon className="size-8 text-white" />
                ) : (
                  <PauseIcon className="size-8 text-white" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      <div className="flex items-center gap-3">
        <IconButton
          variant="project"
          size="sm"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            ref={progressFillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
            style={{ width: "0%" }}
          />
        </div>
        <span ref={timeTextRef} className="font-mono text-xs text-muted tabular-nums">
          {formatMs(0)} / {formatMs(totalMs)}
        </span>
        <IconButton
          variant="ghost-muted"
          size="sm"
          onClick={onRestart}
          aria-label="Restart from beginning"
        >
          <RotateCcwIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default WebReplayView;
