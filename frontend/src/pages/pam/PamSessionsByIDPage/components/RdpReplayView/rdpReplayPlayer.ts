import wasmInit, { InitOutput, RdpDecoder } from "@app/lib/ironrdp-decoder/infisical_rdp_decoder";

export type RdpEventType = "keyboard" | "unicode" | "mouse" | "target_frame";

export type RdpEvent = {
  type: RdpEventType;
  elapsedMs: number;
  scancode?: number;
  codePoint?: number;
  x?: number;
  y?: number;
  wheelDelta?: number;
  flags?: number;
  action?: "x224" | "fastpath";
  payload?: Uint8Array;
};

type PlayerCallbacks = {
  onTick: (currentMs: number) => void;
  onEnded: () => void;
  onContentBoundsChange: (width: number, height: number) => void;
  onBuffering: (buffering: boolean) => void;
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

  // Stays true while buffering so an append can auto-resume playback.
  private wantPlay = false;

  private streamComplete = false;

  private buffering = false;

  // Running max of blitted rects; discovers the real desktop size.
  private contentMaxX = 0;

  private contentMaxY = 0;

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
    // Prime pointer position off-screen so the first server-emitted pointer
    // bitmap doesn't paint at (0,0) before the first recorded mouse event.
    decoder.move_pointer(0xffff, 0xffff);
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
    return this.wantPlay;
  }

  get isBuffering(): boolean {
    return this.buffering;
  }

  play = () => {
    if (this.wantPlay) return;
    // Play after end-of-stream replays from t=0.
    if (this.streamComplete && this.index >= this.events.length) {
      this.resetForReplay();
    }
    this.wantPlay = true;
    if (this.index >= this.events.length) {
      this.setBuffering(true);
      return;
    }
    this.startRaf();
  };

  pause = () => {
    this.wantPlay = false;
    this.stopRaf();
    this.setBuffering(false);
  };

  restart = () => {
    this.resetForReplay();
    this.wantPlay = false;
  };

  // Shared between restart() and the play()-after-end auto-replay path.
  private resetForReplay = () => {
    this.stopRaf();
    this.setBuffering(false);
    this.index = 0;
    this.clockMs = 0;
    this.contentMaxX = 0;
    this.contentMaxY = 0;
    // Frames are deltas, so replaying needs a fresh decoder state.
    this.decoder.free();
    this.decoder = new RdpDecoder(this.canvas.width, this.canvas.height);
    this.decoder.move_pointer(0xffff, 0xffff);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.callbacks.onTick(0);
  };

  // Caller must preserve global elapsedMs ordering across calls.
  appendEvents = (more: RdpEvent[]) => {
    if (more.length === 0) return;
    this.events.push(...more);
    if (this.buffering && this.wantPlay) {
      this.setBuffering(false);
      this.startRaf();
    }
  };

  markStreamComplete = () => {
    if (this.streamComplete) return;
    this.streamComplete = true;
    if (this.buffering) {
      this.setBuffering(false);
      this.wantPlay = false;
      this.callbacks.onEnded();
    }
  };

  dispose = () => {
    this.stopRaf();
    this.wantPlay = false;
    this.buffering = false;
    try {
      this.decoder.free();
    } catch {
      /* ignore */
    }
  };

  private startRaf = () => {
    if (this.raf !== null) return;
    this.wallStart = performance.now() - this.clockMs;
    this.tick();
  };

  private stopRaf = () => {
    if (this.raf === null) return;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.wallStart = null;
  };

  private setBuffering = (value: boolean) => {
    if (this.buffering === value) return;
    this.buffering = value;
    this.callbacks.onBuffering(value);
  };

  private tick = () => {
    if (this.wallStart === null) return;
    const now = performance.now();
    this.clockMs = now - this.wallStart;

    while (this.index < this.events.length && this.events[this.index].elapsedMs <= this.clockMs) {
      // One bad event shouldn't halt the raf loop.
      try {
        this.apply(this.events[this.index]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("RDP replay: apply failed, skipping event", err);
      }
      this.index += 1;
    }

    this.callbacks.onTick(this.clockMs);

    if (this.index >= this.events.length) {
      this.raf = null;
      this.wallStart = null;
      if (this.streamComplete) {
        this.wantPlay = false;
        this.callbacks.onEnded();
      } else {
        this.setBuffering(true);
      }
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
        // Server only sends PositionPointer for its own moves; drive cursor from input.
        if (ev.x !== undefined && ev.y !== undefined) {
          const count = this.decoder.move_pointer(ev.x, ev.y);
          // expandBounds=false: cursor composite rects can extend slightly
          // past the framebuffer (sprite at the desktop edge). Cursor
          // position shouldn't define the recording's desktop bounds.
          if (count > 0) this.blitDirtyRects(count, false);
        }
        break;
      case "keyboard":
      case "unicode":
        break;
      default:
        break;
    }
  };

  private blitDirtyRects = (count: number, expandBounds = true) => {
    // Re-view: wasm-bindgen may reallocate linear memory between calls.
    const ptr = this.decoder.buffer_ptr();
    const len = this.decoder.buffer_len();
    const width = this.decoder.width();
    const height = this.decoder.height();
    const fb = new Uint8ClampedArray(this.wasm.memory.buffer, ptr, len);
    const fullImage = new ImageData(fb, width, height);

    let boundsExpanded = false;
    for (let i = 0; i < count; i += 1) {
      const r = this.decoder.dirty_rect(i);
      if (r) {
        this.ctx.putImageData(fullImage, 0, 0, r.x, r.y, r.w, r.h);
        if (expandBounds) {
          const right = r.x + r.w;
          const bottom = r.y + r.h;
          if (right > this.contentMaxX) {
            this.contentMaxX = right;
            boundsExpanded = true;
          }
          if (bottom > this.contentMaxY) {
            this.contentMaxY = bottom;
            boundsExpanded = true;
          }
        }
        r.free();
      }
    }
    if (boundsExpanded) {
      this.callbacks.onContentBoundsChange(this.contentMaxX, this.contentMaxY);
    }
  };

  private feedFrame = (ev: RdpEvent) => {
    if (!ev.payload) return;
    // X.224 activation PDUs corrupt ActiveStage state; FastPath alone is enough.
    if (ev.action === "x224") return;
    let count: number;
    try {
      count = this.decoder.feed(1, ev.payload);
    } catch {
      return;
    }
    if (count === 0) return;
    this.blitDirtyRects(count);
  };
}

const decodeBase64ToUint8 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

// Wire shape: base64 JSON. See rdp*Envelope in cli/.../rdp/proxy.go.
export const parseRdpLogEntry = (entry: unknown): RdpEvent | null => {
  const e = entry as { data?: string; channelType?: string };
  if (e?.channelType !== "rdp" || typeof e.data !== "string") return null;
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(atob(e.data));
  } catch {
    return null;
  }
  const type = rec.type as RdpEventType | undefined;
  if (!type) return null;
  const elapsedMs = Number(rec.elapsedNs ?? 0) / 1e6;

  const ev: RdpEvent = { type, elapsedMs };
  if (type === "keyboard") {
    ev.scancode = Number(rec.scancode ?? 0);
    ev.flags = Number(rec.flags ?? 0);
  } else if (type === "unicode") {
    ev.codePoint = Number(rec.codePoint ?? 0);
    ev.flags = Number(rec.flags ?? 0);
  } else if (type === "mouse") {
    ev.x = Number(rec.x ?? 0);
    ev.y = Number(rec.y ?? 0);
    ev.flags = Number(rec.flags ?? 0);
    ev.wheelDelta = Number(rec.wheelDelta ?? 0);
  } else if (type === "target_frame") {
    ev.action = rec.action as "x224" | "fastpath";
    const payloadB64 = rec.payload as string | undefined;
    if (payloadB64) ev.payload = decodeBase64ToUint8(payloadB64);
  }
  return ev;
};
