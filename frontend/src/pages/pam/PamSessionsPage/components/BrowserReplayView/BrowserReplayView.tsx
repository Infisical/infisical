import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  GlobeIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  TriangleAlertIcon
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ButtonGroup,
  IconButton,
  Label,
  Toggle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { TSessionEvent } from "@app/hooks/api/pam";
import { TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

import {
  buildBrowserReplay,
  buildBrowserTimeline,
  formatPlaybackTime,
  TBrowserInputKind,
  TBrowserReplayModel,
  urlAt
} from "./browserReplay";
import { BrowserReplayPlayer, LIVE_SLACK_MS } from "./browserReplayPlayer";
import { BrowserReplayTimeline, UrlText } from "./BrowserReplayTimeline";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const OUTER_ASPECT_W = 16;
const OUTER_ASPECT_H = 10;
const OUTER_ASPECT = OUTER_ASPECT_W / OUTER_ASPECT_H;

const SPEEDS = [1, 2, 4];

const SEEK_STEP_MS = 5000;

// The playhead moves every animation frame through refs; the clock, URL bar and timeline only need
// a few updates a second
const DISPLAY_INTERVAL_MS = 250;

// Keeps ticks distinguishable when a long session crowds thousands of clicks onto the bar
const MARKER_BUCKETS = 400;

const MAX_LISTED_GAPS = 3;

const CLICK_KINDS: TBrowserInputKind[] = ["click", "double_click", "right_click"];

type TMarkerKind = "navigation" | "click" | "blocked";

const MARKER_STYLES: Record<TMarkerKind, { label: string; className: string }> = {
  navigation: { label: "Navigation", className: "bg-info h-3" },
  click: { label: "Click", className: "bg-foreground/60 h-2" },
  blocked: { label: "Blocked", className: "bg-warning h-3" }
};

const markerPositions = (times: number[], totalMs: number) => {
  if (totalMs <= 0) return [];
  const buckets = new Set(times.map((ms) => Math.round((ms / totalMs) * MARKER_BUCKETS)));
  return [...buckets].map((bucket) => (Math.min(bucket, MARKER_BUCKETS) / MARKER_BUCKETS) * 100);
};

const buildMarkers = (model: TBrowserReplayModel) => {
  const times: Record<TMarkerKind, number[]> = {
    navigation: model.navigations.map((navigation) => navigation.elapsedMs),
    click: model.inputs
      .filter((input) => CLICK_KINDS.includes(input.kind))
      .map((input) => input.elapsedMs),
    blocked: model.blockedRequests.map((blocked) => blocked.elapsedMs)
  };
  return (Object.keys(times) as TMarkerKind[]).map((kind) => ({
    kind,
    positions: markerPositions(times[kind], model.totalMs)
  }));
};

type Props = {
  events: (TSessionEvent | TBrokenChunkMarker)[];
  isStreaming?: boolean;
};

export const BrowserReplayView = ({ events, isStreaming = false }: Props) => {
  const model = useMemo(() => buildBrowserReplay(events), [events]);
  const timeline = useMemo(() => buildBrowserTimeline(model), [model]);
  const markers = useMemo(() => buildMarkers(model), [model]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<BrowserReplayPlayer | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const currentMsRef = useRef(0);
  const lastDisplayAtRef = useRef(0);
  const skipIdleId = useId();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipIdle, setSkipIdle] = useState(true);
  const [displayMs, setDisplayMs] = useState(0);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [error, setError] = useState<string | null>(null);

  const writeProgress = (ms: number) => {
    currentMsRef.current = ms;
    const total = modelRef.current.totalMs;
    const pct = total > 0 ? Math.min(1, ms / total) * 100 : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    const now = performance.now();
    if (now - lastDisplayAtRef.current >= DISPLAY_INTERVAL_MS || !playerRef.current?.isPlaying) {
      lastDisplayAtRef.current = now;
      setDisplayMs(ms);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let player: BrowserReplayPlayer;
    try {
      player = new BrowserReplayPlayer(canvas, modelRef.current, isStreaming, {
        onTick: writeProgress,
        onPlayingChange: setIsPlaying,
        onWaitingChange: (waiting) => {
          setIsWaiting(waiting);
          setDisplayMs(currentMsRef.current);
        },
        onViewportChange: (width, height) =>
          setViewport((prev) =>
            prev.width === width && prev.height === height ? prev : { width, height }
          )
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize the replay player");
      return undefined;
    }
    playerRef.current = player;
    if (isStreaming) {
      player.seek(modelRef.current.totalMs);
      player.play();
    } else {
      player.seek(0);
    }
    return () => {
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    playerRef.current?.setModel(model);
  }, [model]);

  useEffect(() => {
    playerRef.current?.setStreaming(isStreaming);
  }, [isStreaming]);

  const onSeek = useCallback((ms: number) => {
    playerRef.current?.seek(ms);
  }, []);

  const onPlayPause = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying) player.pause();
    else player.play();
  };

  const onSpeedChange = (value: number) => {
    setSpeed(value);
    playerRef.current?.setSpeed(value);
  };

  const onSkipIdleChange = (value: boolean) => {
    setSkipIdle(value);
    playerRef.current?.setSkipIdle(value);
  };

  const onJumpToLive = () => {
    const player = playerRef.current;
    if (!player) return;
    player.seek(modelRef.current.totalMs);
    player.play();
  };

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * modelRef.current.totalMs);
  };

  const onScrubKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = currentMsRef.current;
    let target: number | null = null;
    if (event.key === "ArrowLeft") target = current - SEEK_STEP_MS;
    else if (event.key === "ArrowRight") target = current + SEEK_STEP_MS;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = model.totalMs;
    if (target === null) return;
    event.preventDefault();
    onSeek(target);
  };

  if (error) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
        <span>Playback unavailable: the replay player could not start.</span>
        <span className="text-danger/70">{error}</span>
      </div>
    );
  }

  const { totalMs, frames, gaps } = model;
  const currentUrl = urlAt(model, displayMs);
  const isBehindLive = isStreaming && totalMs - displayMs > LIVE_SLACK_MS;
  const hasMarkers = markers.some((marker) => marker.positions.length > 0) || gaps.length > 0;
  const contentAspect = viewport.width / viewport.height;

  let emptyMessage: string | null = null;
  if (frames.length === 0) {
    emptyMessage = isStreaming
      ? "Waiting for the first frame from the gateway"
      : "No frames were recorded for this session";
  }

  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @5xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-container px-2.5 text-xs">
            <GlobeIcon className="size-3.5 shrink-0 text-muted" />
            {currentUrl ? (
              <UrlText url={currentUrl.url} className="font-mono" />
            ) : (
              <span className="text-muted">No page loaded yet</span>
            )}
            {currentUrl?.title && (
              <span
                className="ml-auto max-w-[40%] shrink-0 truncate text-muted"
                title={currentUrl.title}
              >
                {currentUrl.title}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onPlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-black focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none"
            style={{ aspectRatio: `${OUTER_ASPECT_W} / ${OUTER_ASPECT_H}` }}
          >
            <canvas
              ref={canvasRef}
              width={DEFAULT_VIEWPORT.width}
              height={DEFAULT_VIEWPORT.height}
              aria-label="Web app session replay"
              className={cn("block min-h-0 min-w-0", frames.length === 0 && "invisible")}
              style={{
                aspectRatio: `${viewport.width} / ${viewport.height}`,
                ...(contentAspect <= OUTER_ASPECT ? { height: "100%" } : { width: "100%" })
              }}
            />
            {emptyMessage && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/70">
                {emptyMessage}
              </span>
            )}
            {!isPlaying && !emptyMessage && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-black/60 opacity-80 transition-opacity group-hover:opacity-100">
                  <PlayIcon className="size-7 text-white" />
                </span>
              </span>
            )}
            {isWaiting && !emptyMessage && (
              <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                <Loader2Icon className="size-3.5 animate-spin" />
                Waiting for the next recording chunk
              </span>
            )}
          </button>

          <div className="flex flex-col gap-1.5">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Playback position"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalMs)}
              aria-valuenow={Math.round(displayMs)}
              aria-valuetext={`${formatPlaybackTime(displayMs)} of ${formatPlaybackTime(totalMs)}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                seekFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
              }}
              onKeyDown={onScrubKeyDown}
              className="relative h-6 cursor-pointer touch-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-3">
                {markers.map(({ kind, positions }) =>
                  positions.map((left) => (
                    <span
                      key={`${kind}-${left}`}
                      className={cn(
                        "absolute bottom-0 w-0.5 -translate-x-1/2 rounded-full",
                        MARKER_STYLES[kind].className
                      )}
                      style={{ left: `${left}%` }}
                    />
                  ))
                )}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  ref={fillRef}
                  className="absolute inset-y-0 left-0 bg-foreground/70"
                  style={{ width: "0%" }}
                />
                {totalMs > 0 &&
                  gaps.map((gap) => (
                    <div
                      key={`${gap.chunkIndex}-${gap.reason}`}
                      className="absolute inset-y-0 min-w-1 bg-danger/70"
                      style={{
                        left: `${(gap.startMs / totalMs) * 100}%`,
                        width: `${((gap.endMs - gap.startMs) / totalMs) * 100}%`
                      }}
                    />
                  ))}
              </div>
              <div
                ref={thumbRef}
                className="pointer-events-none absolute bottom-0.5 size-3 -translate-x-1/2 rounded-full border border-border bg-foreground"
                style={{ left: "0%" }}
              />
            </div>
            {hasMarkers && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                {markers
                  .filter((marker) => marker.positions.length > 0)
                  .map(({ kind }) => (
                    <span key={kind} className="flex items-center gap-1.5">
                      <span className={cn("w-0.5 rounded-full", MARKER_STYLES[kind].className)} />
                      {MARKER_STYLES[kind].label}
                    </span>
                  ))}
                {gaps.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1 w-2 rounded-full bg-danger/70" />
                    Missing recording
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <IconButton
              variant="pam"
              size="sm"
              onClick={onPlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <span className="font-mono text-xs text-muted tabular-nums">
              {formatPlaybackTime(displayMs)} / {formatPlaybackTime(totalMs)}
            </span>
            {isBehindLive && (
              <Button variant="outline" size="xs" onClick={onJumpToLive}>
                <RadioIcon />
                Jump to Live
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Toggle
                  id={skipIdleId}
                  size="sm"
                  variant="pam"
                  checked={skipIdle}
                  onCheckedChange={onSkipIdleChange}
                />
                <Label htmlFor={skipIdleId} className="text-xs text-accent">
                  Skip Idle
                </Label>
              </div>
              <ButtonGroup aria-label="Playback speed">
                {SPEEDS.map((value) => (
                  <Button
                    key={value}
                    size="xs"
                    variant={speed === value ? "pam" : "outline"}
                    aria-pressed={speed === value}
                    onClick={() => onSpeedChange(value)}
                  >
                    {value}×
                  </Button>
                ))}
              </ButtonGroup>
            </div>
          </div>

          {gaps.length > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>
                {gaps.length === 1
                  ? "1 recording chunk couldn't be loaded"
                  : `${gaps.length} recording chunks couldn't be loaded`}
              </AlertTitle>
              <AlertDescription>
                <p>The stretches they covered are marked on the playback bar.</p>
                {gaps.slice(0, MAX_LISTED_GAPS).map((gap) => (
                  <p key={`${gap.chunkIndex}-${gap.reason}`}>
                    Chunk {gap.chunkIndex}: {gap.message}
                  </p>
                ))}
                {gaps.length > MAX_LISTED_GAPS && (
                  <p>And {gaps.length - MAX_LISTED_GAPS} more.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <BrowserReplayTimeline
          rows={timeline}
          currentMs={displayMs}
          isPlaying={isPlaying}
          isStreaming={isStreaming}
          onSeek={onSeek}
          className="@5xl:w-[26rem] @5xl:shrink-0"
        />
      </div>
    </div>
  );
};

export default BrowserReplayView;
