/**
 * ReplayPlayer
 *
 * Consumes the session-log stream recorded by the gateway (see
 * packages/pam/handlers/rdp/proxy.go recordedRDPEvent) and drives a
 * canvas + overlays at real-time timings.
 *
 * Frame decoding is delegated to the WASM module at `@app/lib/ironrdp-decoder`,
 * which wraps IronRDP's upstream ActiveStage + DecodedImage. That gives us
 * the real decoder catalog (RLE bitmap, RDP6, pointer compositing) instead
 * of the small JS subset we had before.
 *
 * Control surface is deliberately small: play / pause / restart +
 * a tick callback so the wrapping component can update its UI.
 * Seek backwards is not supported (frames are deltas; real seek would
 * need keyframes or a reset-then-fast-forward pass).
 */

import wasmInit, {
  InitOutput,
  RdpDecoder
} from "@app/lib/ironrdp-decoder/infisical_rdp_decoder";

export type RdpEventType = "keyboard" | "unicode" | "mouse" | "target_frame";

export type RdpEvent = {
  type: RdpEventType;
  elapsedMs: number;
  // keyboard
  scancode?: number;
  // unicode
  codePoint?: number;
  // mouse
  x?: number;
  y?: number;
  wheelDelta?: number;
  // common
  flags?: number;
  // target_frame
  action?: "x224" | "fastpath";
  payload?: Uint8Array;
};

type PlayerCallbacks = {
  onTick: (currentMs: number) => void;
  onKey: (entry: { elapsedMs: number; scancode?: number; codePoint?: number; release: boolean }) => void;
  onEnded: () => void;
};

let wasmReady: Promise<InitOutput> | null = null;
const ensureWasm = (): Promise<InitOutput> => {
  if (!wasmReady) wasmReady = wasmInit();
  return wasmReady;
};

export class RdpReplayPlayer {
  private events: RdpEvent[];

  private canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D;

  private callbacks: PlayerCallbacks;

  private decoder: RdpDecoder;

  private wasm: InitOutput;

  private index = 0;

  private clockMs = 0;

  private wallStart: number | null = null;

  private raf: number | null = null;

  private constructor(
    events: RdpEvent[],
    canvas: HTMLCanvasElement,
    callbacks: PlayerCallbacks,
    decoder: RdpDecoder,
    wasm: InitOutput
  ) {
    this.events = events;
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.callbacks = callbacks;
    this.decoder = decoder;
    this.wasm = wasm;
  }

  static async create(
    events: RdpEvent[],
    canvas: HTMLCanvasElement,
    callbacks: PlayerCallbacks
  ): Promise<RdpReplayPlayer> {
    const wasm = await ensureWasm();
    const decoder = new RdpDecoder(canvas.width, canvas.height);
    return new RdpReplayPlayer(events, canvas, callbacks, decoder, wasm);
  }

  get totalMs(): number {
    const last = this.events[this.events.length - 1];
    return last ? last.elapsedMs : 0;
  }

  get currentMs(): number {
    return this.clockMs;
  }

  get isPlaying(): boolean {
    return this.raf !== null;
  }

  play = () => {
    if (this.raf !== null) return;
    if (this.index >= this.events.length) return;
    this.wallStart = performance.now() - this.clockMs;
    this.tick();
  };

  pause = () => {
    if (this.raf === null) return;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.wallStart = null;
  };

  restart = () => {
    this.pause();
    this.index = 0;
    this.clockMs = 0;
    // A restart needs a fresh decoder state — frames are deltas, so
    // replaying from T=0 against a non-fresh decoder would reuse
    // already-applied delta state on top of the still-present pixels.
    this.decoder.free();
    this.decoder = new RdpDecoder(this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.debugPduCounts.clear();
    this.debugDirtyRectsPerType.clear();
    this.callbacks.onTick(0);
  };

  dispose = () => {
    this.pause();
    try {
      this.decoder.free();
    } catch {
      /* ignore */
    }
  };

  private tick = () => {
    if (this.wallStart === null) return;
    const now = performance.now();
    this.clockMs = now - this.wallStart;

    while (this.index < this.events.length && this.events[this.index].elapsedMs <= this.clockMs) {
      this.apply(this.events[this.index]);
      this.index += 1;
    }

    this.callbacks.onTick(this.clockMs);

    if (this.index >= this.events.length) {
      this.raf = null;
      this.wallStart = null;
      this.callbacks.onEnded();
      return;
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  private apply = (ev: RdpEvent) => {
    switch (ev.type) {
      case "target_frame":
        if (ev.payload) this.feedFrame(ev);
        break;
      case "mouse":
        if (ev.x !== undefined && ev.y !== undefined) {
          // Drive the server-rendered pointer sprite from recorded mouse
          // input. The Windows server only sends PositionPointer PDUs for
          // server-initiated cursor moves; normal movement is resolved
          // client-side, so replay has to replay it the same way.
          const count = this.decoder.move_pointer(ev.x, ev.y);
          if (count > 0) this.blitDirtyRects(count);
        }
        break;
      case "keyboard":
      case "unicode": {
        const release = ((ev.flags ?? 0) & 0x01) !== 0;
        this.callbacks.onKey({
          elapsedMs: ev.elapsedMs,
          scancode: ev.scancode,
          codePoint: ev.codePoint,
          release
        });
        break;
      }
      default:
        break;
    }
  };

  private blitDirtyRects = (count: number) => {
    // Construct a view over the WASM-side framebuffer. We re-create the
    // view each call because wasm-bindgen can reallocate linear memory
    // on growth, invalidating any older pointer/length pair.
    const ptr = this.decoder.buffer_ptr();
    const len = this.decoder.buffer_len();
    const width = this.decoder.width();
    const height = this.decoder.height();
    const fb = new Uint8ClampedArray(this.wasm.memory.buffer, ptr, len);
    const fullImage = new ImageData(fb, width, height);

    for (let i = 0; i < count; i += 1) {
      const r = this.decoder.dirty_rect(i);
      if (!r) continue;
      // 8-arg putImageData clips to (dx, dy, dw, dh) rect of the source.
      this.ctx.putImageData(fullImage, 0, 0, r.x, r.y, r.w, r.h);
      r.free();
    }
  };

  // Running tally of PDU types we've seen and how many dirty rects each
  // produced. Dumped via `playerRef.current?.dumpStats()` from the
  // browser console. Used to debug cursor/pointer rendering issues.
  private debugPduCounts = new Map<string, number>();

  private debugDirtyRectsPerType = new Map<string, number>();

  dumpStats = () => {
    // eslint-disable-next-line no-console
    console.log("[replay] PDU counts:");
    // eslint-disable-next-line no-console
    console.table(Object.fromEntries(this.debugPduCounts));
    // eslint-disable-next-line no-console
    console.log("[replay] dirty rects returned per PDU type:");
    // eslint-disable-next-line no-console
    console.table(Object.fromEntries(this.debugDirtyRectsPerType));
  };

  private feedFrame = (ev: RdpEvent) => {
    if (!ev.payload) return;
    const action = ev.action === "x224" ? 0 : 1;

    // DEBUG: classify each FastPath output PDU so we can confirm pointer
    // updates are in the recorded stream. Layout:
    //   [0] fpOutputHeader  (action + flags)
    //   [1] length low byte (if high bit set, a 2-byte length follows)
    //   [N] first update byte: low 4 bits = update_code
    let pduName = action === 0 ? "X224" : "FastPath(?)";
    if (action === 1 && ev.payload.length >= 3) {
      const length1 = ev.payload[1];
      const hdrSize = (length1 & 0x80) !== 0 ? 3 : 2;
      if (ev.payload.length > hdrSize) {
        const updateCode = ev.payload[hdrSize] & 0x0f;
        pduName =
          (
            {
              0: "Orders",
              1: "Bitmap",
              2: "Palette",
              3: "Synchronize",
              4: "SurfaceCommands",
              5: "HiddenPointer",
              6: "DefaultPointer",
              8: "PositionPointer",
              9: "ColorPointer",
              10: "CachedPointer",
              11: "NewPointer",
              12: "LargePointer"
            } as Record<number, string>
          )[updateCode] ?? `unknown(0x${updateCode.toString(16)})`;
      }
    }
    this.debugPduCounts.set(pduName, (this.debugPduCounts.get(pduName) ?? 0) + 1);

    let count: number;
    try {
      count = this.decoder.feed(action, ev.payload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[replay] decoder.feed(${pduName}) threw`, e);
      return;
    }

    this.debugDirtyRectsPerType.set(
      pduName,
      (this.debugDirtyRectsPerType.get(pduName) ?? 0) + count
    );

    if (count === 0) return;
    this.blitDirtyRects(count);
  };
}

/**
 * Parse a session-log entry into an RdpEvent, or null if the entry isn't
 * a recognized RDP event. The backend delivers log items whose `data`
 * field is base64 of the Go-side recordedRDPEvent JSON (see
 * packages/pam/handlers/rdp/proxy.go).
 */
export const parseRdpLogEntry = (entry: unknown): RdpEvent | null => {
  const e = entry as { data?: string; channelType?: string; elapsedTime?: number };
  if (e?.channelType !== "rdp" || typeof e.data !== "string") return null;
  let rec: Record<string, unknown>;
  try {
    const jsonStr = atob(e.data);
    rec = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const type = rec.type as RdpEventType | undefined;
  if (!type) return null;
  const elapsedNs = Number(rec.elapsed_ns ?? 0);
  const elapsedMs = elapsedNs / 1e6;

  const ev: RdpEvent = { type, elapsedMs };
  if (type === "keyboard") {
    ev.scancode = Number(rec.scancode ?? 0);
    ev.flags = Number(rec.flags ?? 0);
  } else if (type === "unicode") {
    ev.codePoint = Number(rec.code_point ?? 0);
    ev.flags = Number(rec.flags ?? 0);
  } else if (type === "mouse") {
    ev.x = Number(rec.x ?? 0);
    ev.y = Number(rec.y ?? 0);
    ev.flags = Number(rec.flags ?? 0);
    ev.wheelDelta = Number(rec.wheel_delta ?? 0);
  } else if (type === "target_frame") {
    ev.action = rec.action as "x224" | "fastpath";
    const payloadB64 = rec.payload as string | undefined;
    if (payloadB64) {
      ev.payload = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
    }
  }
  return ev;
};
