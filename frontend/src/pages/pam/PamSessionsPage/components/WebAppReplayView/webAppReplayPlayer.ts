export type WebAppReplayEvent = {
  elapsedMs: number;
  dataUrl: string;
};

type PlayerCallbacks = {
  onFrame: (dataUrl: string) => void;
  onTick: (currentMs: number) => void;
  onEnded: () => void;
  onBuffering: (buffering: boolean) => void;
};

// Bare-bones frame-sequence player: unlike RDP (which applies incremental
// PDU diffs via a WASM decoder), each WebApp replay event is already a
// complete JPEG frame, so playback just means picking the right frame for
// the current clock time and swapping an <img> src - no decoder needed.
export class WebAppReplayPlayer {
  private events: WebAppReplayEvent[];

  private callbacks: PlayerCallbacks;

  private index = 0;

  private clockMs = 0;

  private wallStart: number | null = null;

  private raf: number | null = null;

  private wantPlay = false;

  private streamComplete = false;

  private buffering = false;

  constructor(events: WebAppReplayEvent[], callbacks: PlayerCallbacks) {
    this.events = events;
    this.callbacks = callbacks;
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
    if (this.streamComplete && this.index >= this.events.length) {
      this.restart();
      return;
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
    this.stopRaf();
    this.setBuffering(false);
    this.index = 0;
    this.clockMs = 0;
    this.callbacks.onTick(0);
    if (this.events[0]) this.callbacks.onFrame(this.events[0].dataUrl);
    this.wantPlay = false;
  };

  appendEvents = (more: WebAppReplayEvent[]) => {
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

    let advanced = false;
    while (this.index < this.events.length && this.events[this.index].elapsedMs <= this.clockMs) {
      advanced = true;
      this.index += 1;
    }
    if (advanced) this.callbacks.onFrame(this.events[this.index - 1].dataUrl);

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
}

export const parseWebAppLogEntry = (entry: unknown): WebAppReplayEvent | null => {
  const e = entry as { data?: string; channelType?: string; elapsedTime?: number };
  if (e?.channelType !== "webapp" || typeof e.data !== "string") return null;

  let envelope: { direction?: string; message?: { method?: string; params?: { data?: string } } };
  try {
    envelope = JSON.parse(atob(e.data));
  } catch {
    return null;
  }

  if (
    envelope.direction !== "browser_to_client" ||
    envelope.message?.method !== "Page.screencastFrame"
  ) {
    return null;
  }
  const frameData = envelope.message.params?.data;
  if (!frameData) return null;

  return {
    elapsedMs: Number(e.elapsedTime ?? 0) * 1000,
    dataUrl: `data:image/jpeg;base64,${frameData}`
  };
};
