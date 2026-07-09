import { useEffect, useRef, useState } from "react";
import { Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TSessionEvent } from "@app/hooks/api/pam";
import { isBrokenChunkMarker, TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

import { parseWebAppLogEntry, WebAppReplayEvent, WebAppReplayPlayer } from "./webAppReplayPlayer";

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = r.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

type WebAppReplayLogEvent = TSessionEvent | TBrokenChunkMarker;

const parseRange = (
  events: WebAppReplayLogEvent[],
  start: number,
  end: number
): WebAppReplayEvent[] => {
  const out: WebAppReplayEvent[] = [];
  for (let i = start; i < end; i += 1) {
    const event = events[i];
    if (!isBrokenChunkMarker(event)) {
      const ev = parseWebAppLogEntry(event);
      if (ev) out.push(ev);
    }
  }
  return out;
};

type Props = {
  events: WebAppReplayLogEvent[];
  isStreaming?: boolean;
  totalDurationMs?: number;
};

// Minimal frame-sequence viewer, deliberately not at parity with RDP's
// replay polish (no canvas dirty-rect tracking needed - each event is
// already a complete JPEG).
export const WebAppReplayView = ({ events, isStreaming = false, totalDurationMs }: Props) => {
  const playerRef = useRef<WebAppReplayPlayer | null>(null);
  const lastParsedIndexRef = useRef(0);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const currentMsRef = useRef(0);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [lastSeenEventMs, setLastSeenEventMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const totalMs = totalDurationMs && totalDurationMs > 0 ? totalDurationMs : lastSeenEventMs;
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

  useEffect(() => {
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (isBrokenChunkMarker(ev)) {
        setError(`Chunk ${ev.chunkIndex}: ${ev.message}`);
        return undefined;
      }
    }

    const initial = parseRange(events, 0, events.length);
    lastParsedIndexRef.current = events.length;
    if (initial.length > 0) {
      setLastSeenEventMs(initial[initial.length - 1].elapsedMs);
      setFrameDataUrl(initial[0].dataUrl);
    }

    const player = new WebAppReplayPlayer(initial, {
      onFrame: setFrameDataUrl,
      onTick: writeProgress,
      onEnded: () => {
        setIsPlaying(false);
        setIsBuffering(false);
      },
      onBuffering: setIsBuffering
    });
    playerRef.current = player;

    return () => {
      player.dispose();
      playerRef.current = null;
      lastParsedIndexRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (events.length <= lastParsedIndexRef.current) return;
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
  }, [events]);

  useEffect(() => {
    if (!isStreaming && playerRef.current) {
      playerRef.current.markStreamComplete();
    }
  }, [isStreaming]);

  const onPlayPause = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying) {
      p.pause();
      setIsPlaying(false);
      return;
    }
    p.play();
    setIsPlaying(true);
  };

  const onRestart = () => {
    const p = playerRef.current;
    if (!p) return;
    p.restart();
    setIsPlaying(false);
    setIsBuffering(false);
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
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-black">
        {frameDataUrl ? (
          <img src={frameDataUrl} className="max-h-full max-w-full" alt="WebApp session replay" />
        ) : (
          <span className="text-sm text-muted">No frames recorded</span>
        )}
        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              <span>Buffering...</span>
            </div>
          </div>
        )}
      </div>
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

export default WebAppReplayView;
