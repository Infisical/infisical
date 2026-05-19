import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TSessionEvent } from "@app/hooks/api/pam";
import { isBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

import { parseRdpLogEntry, RdpEvent, RdpReplayPlayer } from "./rdpReplayPlayer";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
// Locks the player footprint so it doesn't reshape on first frame.
const OUTER_ASPECT_W = 16;
const OUTER_ASPECT_H = 9;
const OUTER_ASPECT = OUTER_ASPECT_W / OUTER_ASPECT_H;

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = r.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const parseRange = (events: TSessionEvent[], start: number, end: number): RdpEvent[] => {
  const out: RdpEvent[] = [];
  for (let i = start; i < end; i += 1) {
    const ev = parseRdpLogEntry(events[i]);
    if (ev) out.push(ev);
  }
  return out;
};

type Props = {
  events: TSessionEvent[];
  isStreaming?: boolean;
  totalDurationMs?: number;
};

export const RdpReplayView = ({ events, isStreaming = false, totalDurationMs }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<RdpReplayPlayer | null>(null);
  const lastParsedIndexRef = useRef(0);
  // raf-frequency updates: write progress fill + time text via refs to
  // avoid re-rendering the player subtree at 60fps.
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const currentMsRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [lastSeenEventMs, setLastSeenEventMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Re-triggers the events / isStreaming effects once the async WASM init
  // resolves; ref assignment alone wouldn't schedule a render.
  const [playerReady, setPlayerReady] = useState(false);
  // nonce remounts AnimatePresence on rapid toggles so the pulse restarts.
  const [feedback, setFeedback] = useState<{
    icon: "play" | "pause";
    nonce: number;
  } | null>(null);
  const totalMs = totalDurationMs && totalDurationMs > 0 ? totalDurationMs : lastSeenEventMs;
  const [contentBounds, setContentBounds] = useState({
    width: CANVAS_W,
    height: CANVAS_H
  });

  const totalMsRef = useRef(totalMs);
  totalMsRef.current = totalMs;

  const writeProgress = (ms: number) => {
    currentMsRef.current = ms;
    const total = totalMsRef.current;
    if (progressFillRef.current) {
      const pct = total > 0 ? Math.min(1, ms / total) * 100 : 0;
      progressFillRef.current.style.width = `${pct}%`;
    }
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${formatMs(ms)} / ${formatMs(total)}`;
    }
  };

  // Player lifetime is mount-scoped; later chunks land via appendEvents.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // RDP frames are deltas; bail before creating the player if the initial
    // event range already includes a corrupt-chunk marker (the events effect
    // below only checks events past lastParsedIndexRef).
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (isBrokenChunkMarker(ev)) {
        setError(`Chunk ${ev.chunkIndex}: ${ev.message}`);
        return undefined;
      }
    }

    const initial = parseRange(events, 0, events.length);
    lastParsedIndexRef.current = events.length;
    if (initial.length > 0) setLastSeenEventMs(initial[initial.length - 1].elapsedMs);

    RdpReplayPlayer.create(initial, canvas, {
      onTick: writeProgress,
      onEnded: () => {
        setIsPlaying(false);
        setIsBuffering(false);
      },
      onContentBoundsChange: (width, height) => setContentBounds({ width, height }),
      onBuffering: (b) => setIsBuffering(b)
    })
      .then((player) => {
        if (cancelled) {
          player.dispose();
          return;
        }
        playerRef.current = player;
        // Trigger the events / isStreaming effects to handle any state that
        // accumulated during the async init (events that arrived, isStreaming
        // that flipped to false).
        setPlayerReady(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to initialize RDP replay player");
      });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      lastParsedIndexRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (events.length <= lastParsedIndexRef.current) return;
    // RDP frames are deltas; one corrupt/missing chunk desyncs everything
    // after it. Halt playback and surface the failure rather than rendering
    // garbage frames.
    for (let i = lastParsedIndexRef.current; i < events.length; i += 1) {
      const ev = events[i];
      if (isBrokenChunkMarker(ev)) {
        player.pause();
        setError(`Chunk ${ev.chunkIndex}: ${ev.message}`);
        return;
      }
    }
    const more = parseRange(events, lastParsedIndexRef.current, events.length);
    lastParsedIndexRef.current = events.length;
    if (more.length > 0) {
      player.appendEvents(more);
      setLastSeenEventMs(more[more.length - 1].elapsedMs);
    }
  }, [events, playerReady]);

  useEffect(() => {
    if (!isStreaming && playerRef.current) {
      playerRef.current.markStreamComplete();
    }
  }, [isStreaming, playerReady]);

  useEffect(() => {
    writeProgress(currentMsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMs]);

  const onPlayPause = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying) {
      p.pause();
      setIsPlaying(false);
      setFeedback({ icon: "pause", nonce: Date.now() });
      return;
    }
    // play() auto-replays from t=0 when at end-of-stream; reset bounds too.
    const willAutoReplay = p.currentMs >= p.totalMs && p.totalMs > 0;
    p.play();
    if (willAutoReplay) {
      setContentBounds({ width: CANVAS_W, height: CANVAS_H });
    }
    setIsPlaying(true);
    setFeedback({ icon: "play", nonce: Date.now() });
  };

  useEffect(() => {
    if (!feedback) return undefined;
    const t = setTimeout(() => setFeedback(null), 400);
    return () => clearTimeout(t);
  }, [feedback]);

  const onRestart = () => {
    const p = playerRef.current;
    if (!p) return;
    p.restart();
    setIsPlaying(false);
    setIsBuffering(false);
    setContentBounds({ width: CANVAS_W, height: CANVAS_H });
  };

  if (error) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
        <span>Playback halted: recording chunks are unavailable or corrupted.</span>
        <span className="text-danger/70">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-black focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none"
        style={{ aspectRatio: `${OUTER_ASPECT_W} / ${OUTER_ASPECT_H}` }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: `${contentBounds.width} / ${contentBounds.height}`,
            ...(contentBounds.width / contentBounds.height <= OUTER_ASPECT
              ? { height: "100%" }
              : { width: "100%" })
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{
              width: `${(CANVAS_W / contentBounds.width) * 100}%`,
              height: `${(CANVAS_H / contentBounds.height) * 100}%`,
              display: "block"
            }}
            aria-label="RDP session replay"
          />
        </div>
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
        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              <span>Buffering...</span>
            </div>
          </div>
        )}
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

export default RdpReplayView;
