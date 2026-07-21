import { useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

type Props = {
  events: readonly unknown[];
};

type Frame = { elapsedMs: number; bytes: Uint8Array };

const decodeBase64ToUint8 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

// Parse recorded web-app frames from decrypted session events. Each event's `data`
// is base64(JSON envelope), where the envelope is { payload: base64 JPEG, elapsedNs }.
const parseFrames = (events: readonly unknown[]): Frame[] => {
  const frames: Frame[] = [];
  events.forEach((event) => {
    const e = event as { channelType?: string; data?: string };
    if (e?.channelType !== "webapp" || typeof e.data !== "string") return;
    try {
      const rec = JSON.parse(atob(e.data)) as { payload?: string; elapsedNs?: number };
      if (!rec.payload) return;
      frames.push({
        elapsedMs: Number(rec.elapsedNs ?? 0) / 1e6,
        bytes: decodeBase64ToUint8(rec.payload)
      });
    } catch {
      // skip an unparseable frame
    }
  });
  frames.sort((a, b) => a.elapsedMs - b.elapsedMs);
  return frames;
};

const formatMs = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// Replays a recorded web-app session: draws the JPEG frame due at the playback clock
// onto a <canvas>, with play/pause, restart, and a draggable scrubber.
const WebAppReplayView = ({ events }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frames = useMemo(() => parseFrames(events), [events]);
  const totalMs = frames.length ? frames[frames.length - 1].elapsedMs : 0;

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentMs, setCurrentMs] = useState(0);

  const drawnIndexRef = useRef(-1);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const currentMsRef = useRef(0);
  const playingRef = useRef(true);

  // Keep refs in sync so the animation loop reads fresh values without re-subscribing.
  currentMsRef.current = currentMs;
  playingRef.current = isPlaying;

  // Paint the latest frame due at time t, skipping if it's already drawn.
  const drawAt = (t: number) => {
    if (!frames.length) return;
    let idx = 0;
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i].elapsedMs <= t) idx = i;
      else break;
    }
    if (idx === drawnIndexRef.current) return;
    drawnIndexRef.current = idx;
    const canvas = canvasRef.current;
    if (!canvas) return;
    createImageBitmap(new Blob([frames[idx].bytes], { type: "image/jpeg" }))
      .then((bitmap) => {
        // Drop a stale paint if we've since moved to a different frame.
        if (drawnIndexRef.current !== idx || !canvasRef.current) {
          bitmap.close();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch(() => {
        // ignore an undecodable frame
      });
  };

  // Playback clock: advance currentMs by real elapsed time while playing.
  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (playingRef.current) {
        let next = currentMsRef.current + dt;
        if (next >= totalMs) {
          next = totalMs;
          playingRef.current = false;
          setIsPlaying(false);
        }
        currentMsRef.current = next;
        setCurrentMs(next);
        drawAt(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, totalMs]);

  // Paint the first frame whenever the frame set changes.
  useEffect(() => {
    drawnIndexRef.current = -1;
    drawAt(currentMsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  const handleSeek = (value: number) => {
    currentMsRef.current = value;
    setCurrentMs(value);
    drawAt(value);
  };

  const handleTogglePlay = () => {
    if (currentMsRef.current >= totalMs) handleSeek(0);
    setIsPlaying((p) => !p);
  };

  const handleRestart = () => {
    handleSeek(0);
    setIsPlaying(true);
  };

  if (!frames.length) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted">
        No recorded frames for this session.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center overflow-hidden rounded-md bg-black">
        <canvas ref={canvasRef} className="max-h-[60vh] max-w-full" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="text-muted transition-colors hover:text-mineshaft-100"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
        </button>
        <button
          type="button"
          onClick={handleRestart}
          className="text-muted transition-colors hover:text-mineshaft-100"
          aria-label="Restart"
        >
          <RotateCcwIcon className="size-4" />
        </button>
        <input
          type="range"
          min={0}
          max={totalMs}
          step={1}
          value={currentMs}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-primary"
          aria-label="Seek"
        />
        <span className="w-20 text-right text-xs text-muted tabular-nums">
          {formatMs(currentMs)} / {formatMs(totalMs)}
        </span>
      </div>
    </div>
  );
};

export default WebAppReplayView;
