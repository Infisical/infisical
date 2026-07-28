import { useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TSessionEvent } from "@app/hooks/api/pam";
import { SessionChannelType } from "@app/hooks/api/pam/enums";
import { isBrokenChunkMarker, TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

// A web session recording is a stream of JPEG screencast frames captured at the
// gateway (channelType "cdp-frame", data = base64 jpeg, elapsedTime in seconds).
// Replay = draw each frame on a canvas when the wall clock passes its timestamp,
// like a flipbook. Far simpler than the RDP player (no WASM protocol decoder).

type WebReplayEvent = TSessionEvent | TBrokenChunkMarker;

type Frame = { elapsedMs: number; src: string };

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
};

const isCdpFrameEvent = (ev: WebReplayEvent): ev is TSessionEvent =>
  !isBrokenChunkMarker(ev) &&
  ev.channelType === SessionChannelType.CdpFrame &&
  typeof ev.data === "string" &&
  ev.data.length > 0;

const toFrames = (events: WebReplayEvent[]): Frame[] =>
  events.filter(isCdpFrameEvent).map((ev) => ({
    elapsedMs: (ev.elapsedTime ?? 0) * 1000,
    src: `data:image/jpeg;base64,${ev.data}`
  }));

type Props = {
  events: WebReplayEvent[];
  isStreaming?: boolean;
};

export const WebReplayView = ({ events, isStreaming = false }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const drawIndexRef = useRef<number>(0);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const frames = useMemo(() => toFrames(events), [events]);
  const totalMs = frames.length > 0 ? frames[frames.length - 1].elapsedMs : 0;
  const totalMsRef = useRef(totalMs);
  totalMsRef.current = totalMs;

  const brokenChunk = events.find(isBrokenChunkMarker) as TBrokenChunkMarker | undefined;

  const drawFrameAt = (ms: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    // Find the last frame whose timestamp is <= ms.
    let idx = 0;
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i].elapsedMs <= ms) idx = i;
      else break;
    }
    if (idx === drawIndexRef.current && ms > 0) return;
    drawIndexRef.current = idx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      if (canvas.width !== img.width) canvas.width = img.width;
      if (canvas.height !== img.height) canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = frames[idx].src;
  };

  const writeProgress = (ms: number) => {
    const total = totalMsRef.current;
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${total > 0 ? Math.min(1, ms / total) * 100 : 0}%`;
    }
    if (timeTextRef.current) {
      timeTextRef.current.textContent = `${formatMs(ms)} / ${formatMs(total)}`;
    }
  };

  const stopRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const tick = () => {
    const elapsed = startOffsetRef.current + (performance.now() - startWallRef.current);
    const clamped = Math.min(elapsed, totalMsRef.current);
    drawFrameAt(clamped);
    writeProgress(clamped);
    if (clamped >= totalMsRef.current) {
      stopRaf();
      setIsPlaying(false);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    if (frames.length === 0) return;
    // If at the end, restart from 0.
    if (startOffsetRef.current >= totalMsRef.current) startOffsetRef.current = 0;
    startWallRef.current = performance.now();
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    stopRaf();
    startOffsetRef.current += performance.now() - startWallRef.current;
    setIsPlaying(false);
  };

  const restart = () => {
    stopRaf();
    startOffsetRef.current = 0;
    drawIndexRef.current = 0;
    setIsPlaying(false);
    drawFrameAt(0);
    writeProgress(0);
  };

  // Draw the first frame once available.
  useEffect(() => {
    if (frames.length > 0 && !isPlaying && startOffsetRef.current === 0) {
      drawFrameAt(0);
      writeProgress(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length]);

  useEffect(() => () => stopRaf(), []);

  if (brokenChunk) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
        <span>Playback halted: recording chunks are unavailable or corrupted.</span>
        <span className="text-danger/70">
          Chunk {brokenChunk.chunkIndex}: {brokenChunk.message}
        </span>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted">
        {isStreaming ? "Waiting for frames..." : "No screen recording captured for this session."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-black"
      >
        <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Web session replay" />
      </button>
      <div className="flex items-center gap-3">
        <IconButton
          variant="project"
          size="sm"
          onClick={isPlaying ? pause : play}
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
          onClick={restart}
          aria-label="Restart from beginning"
        >
          <RotateCcwIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default WebReplayView;
