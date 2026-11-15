import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { SessionReplay, type SessionReplayEvent } from "@infisical/cipher/ui/session-replay";

import type { TPamSessionLog } from "@app/hooks/api/pam";
import {
  isBrokenChunkMarker,
  type TBrokenChunkMarker
} from "@app/hooks/api/pam/session-playback/types";
import wasmInit, {
  type InitOutput,
  RdpDecoder
} from "@app/lib/ironrdp-decoder/infisical_rdp_decoder";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const VIEWPORT_ASPECT = 16 / 9;
const POINTER_DOWN = 0x8000;
const CLICKS: [flag: number, label: string][] = [
  [0x1000, "Left click"],
  [0x2000, "Right click"],
  [0x4000, "Middle click"]
];

type TRdpFrame = {
  type: "keyboard" | "unicode" | "mouse" | "target_frame";
  elapsedMs: number;
  x?: number;
  y?: number;
  flags?: number;
  action?: "x224" | "fastpath";
  payload?: Uint8Array;
};

type TRdpReplayEvent = SessionReplayEvent & { frame: TRdpFrame };

const decodeBase64 = (b64: string) => Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));

const parseRdpFrame = (log: TPamSessionLog): TRdpFrame | null => {
  if (!("channelType" in log) || log.channelType !== "rdp" || typeof log.data !== "string")
    return null;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(atob(log.data));
  } catch {
    return null;
  }
  const type = record.type as TRdpFrame["type"] | undefined;
  if (!type) return null;
  const frame: TRdpFrame = { type, elapsedMs: Number(record.elapsedNs ?? 0) / 1e6 };
  if (type === "mouse") {
    frame.x = Number(record.x ?? 0);
    frame.y = Number(record.y ?? 0);
    frame.flags = Number(record.flags ?? 0);
  } else if (type === "target_frame") {
    frame.action = record.action as TRdpFrame["action"];
    if (typeof record.payload === "string") frame.payload = decodeBase64(record.payload);
  }
  return frame;
};

const hasFlag = (flags: number, flag: number) => Math.floor(flags / flag) % 2 === 1;

const toReplayEvent = (frame: TRdpFrame): TRdpReplayEvent => {
  const flags = frame.flags ?? 0;
  const click =
    frame.type === "mouse" && hasFlag(flags, POINTER_DOWN)
      ? CLICKS.find(([flag]) => hasFlag(flags, flag))?.[1]
      : undefined;
  if (!click) return { time: frame.elapsedMs, label: frame.type, listed: false, frame };
  return {
    time: frame.elapsedMs,
    label: `${click} at ${frame.x}, ${frame.y}`,
    frame
  };
};

let wasmReady: Promise<InitOutput> | null = null;
const ensureWasm = () => {
  if (!wasmReady) wasmReady = wasmInit();
  return wasmReady;
};

type TPlayer = {
  wasm: InitOutput;
  context: CanvasRenderingContext2D;
  decoder: RdpDecoder;
  applied: number;
  contentWidth: number;
  contentHeight: number;
};

const freshDecoder = () => {
  const decoder = new RdpDecoder(CANVAS_WIDTH, CANVAS_HEIGHT);
  decoder.move_pointer(0xffff, 0xffff);
  return decoder;
};

type TBounds = { width: number; height: number };

const blit = (player: TPlayer, count: number): TBounds => {
  const { decoder, context } = player;
  const image = new ImageData(
    new Uint8ClampedArray(player.wasm.memory.buffer, decoder.buffer_ptr(), decoder.buffer_len()),
    decoder.width(),
    decoder.height()
  );
  const painted = { width: 0, height: 0 };
  for (let index = 0; index < count; index += 1) {
    const rect = decoder.dirty_rect(index);
    if (rect) {
      context.putImageData(image, 0, 0, rect.x, rect.y, rect.w, rect.h);
      painted.width = Math.max(painted.width, rect.x + rect.w);
      painted.height = Math.max(painted.height, rect.y + rect.h);
      rect.free();
    }
  }
  return painted;
};

// Returns the area a server frame painted, which grows the content bounds; pointer moves never do
const apply = (player: TPlayer, frame: TRdpFrame): TBounds | undefined => {
  try {
    if (frame.type === "target_frame" && frame.payload && frame.action !== "x224") {
      const count = player.decoder.feed(1, frame.payload);
      return count > 0 ? blit(player, count) : undefined;
    }
    if (frame.type === "mouse" && frame.x !== undefined && frame.y !== undefined) {
      const count = player.decoder.move_pointer(frame.x, frame.y);
      if (count > 0) blit(player, count);
    }
  } catch (error) {
    console.warn("RDP replay: apply failed, skipping event", error);
  }
  return undefined;
};

const RdpCanvas = memo(({ events }: { events: readonly TRdpReplayEvent[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<TPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [bounds, setBounds] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  useEffect(() => {
    let cancelled = false;
    ensureWasm().then((wasm) => {
      const context = canvasRef.current?.getContext("2d");
      if (cancelled || !context) return;
      playerRef.current = {
        wasm,
        context,
        decoder: freshDecoder(),
        applied: 0,
        contentWidth: 0,
        contentHeight: 0
      };
      setReady(true);
    });
    return () => {
      cancelled = true;
      playerRef.current?.decoder.free();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    // Frames are deltas, so seeking back replays the recording from the start
    if (events.length < player.applied) {
      player.decoder.free();
      player.decoder = freshDecoder();
      player.applied = 0;
      player.contentWidth = 0;
      player.contentHeight = 0;
      player.context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    for (let index = player.applied; index < events.length; index += 1) {
      const painted = apply(player, events[index].frame);
      if (painted) {
        player.contentWidth = Math.max(player.contentWidth, painted.width);
        player.contentHeight = Math.max(player.contentHeight, painted.height);
      }
    }
    player.applied = events.length;
    const width = player.contentWidth || CANVAS_WIDTH;
    const height = player.contentHeight || CANVAS_HEIGHT;
    setBounds((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  }, [events, ready]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%"
      }}
    >
      <div
        style={{
          overflow: "hidden",
          aspectRatio: `${bounds.width} / ${bounds.height}`,
          ...(bounds.width / bounds.height <= VIEWPORT_ASPECT
            ? { height: "100%" }
            : { width: "100%" })
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="RDP session replay"
          style={{
            display: "block",
            width: `${(CANVAS_WIDTH / bounds.width) * 100}%`,
            height: `${(CANVAS_HEIGHT / bounds.height) * 100}%`
          }}
        />
      </div>
    </div>
  );
});
RdpCanvas.displayName = "RdpCanvas";

const renderViewport = ({ events }: { events: readonly TRdpReplayEvent[] }) => (
  <RdpCanvas events={events} />
);

const RdpReplay = ({ logs }: { logs: readonly (TPamSessionLog | TBrokenChunkMarker)[] }) => {
  const broken = logs.find(isBrokenChunkMarker);
  const events = useMemo(
    () =>
      logs
        .flatMap((log) => {
          if (isBrokenChunkMarker(log)) return [];
          const frame = parseRdpFrame(log);
          return frame ? [toReplayEvent(frame)] : [];
        })
        .sort((a, b) => a.time - b.time),
    [logs]
  );

  if (broken)
    return (
      <Alert tone="bad" title="Playback halted: recording chunks are unavailable or corrupted.">
        {`Chunk ${broken.chunkIndex}: ${broken.message}`}
      </Alert>
    );
  if (events.length === 0)
    return <EmptyState size="sm" icon="monitor" title="No recording for this session" />;

  return (
    <SessionReplay
      aria-label="RDP session replay"
      events={events}
      emptyLabel="No clicks recorded"
      viewport={renderViewport}
    />
  );
};

export default RdpReplay;
