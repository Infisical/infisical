import { BrowserFrameCache } from "./browserFrameCache";
import {
  frameAt,
  frameKey,
  indexAtOrBefore,
  skipIdleStretch,
  TBrowserFrame,
  TBrowserReplayModel
} from "./browserReplay";

const FRAME_CACHE_SIZE = 16;

const PREFETCH_FRAMES = 2;

// The gateway uploads a chunk every 10s and the sheet polls every 5s, so a viewer following a live
// session runs up to this far behind its newest frame
export const LIVE_SLACK_MS = 15_000;

type PlayerCallbacks = {
  onTick: (currentMs: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onWaitingChange: (waiting: boolean) => void;
  onViewportChange: (width: number, height: number) => void;
};

export class BrowserReplayPlayer {
  private model: TBrowserReplayModel;

  private canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D;

  private callbacks: PlayerCallbacks;

  private cache = new BrowserFrameCache(FRAME_CACHE_SIZE);

  private streaming: boolean;

  private clockMs = 0;

  private lastTick: number | null = null;

  private raf: number | null = null;

  private wantPlay = false;

  private waiting = false;

  private drawn: TBrowserFrame | null = null;

  private wanted: TBrowserFrame | null = null;

  private speed = 1;

  private skipIdle = true;

  constructor(
    canvas: HTMLCanvasElement,
    model: TBrowserReplayModel,
    streaming: boolean,
    callbacks: PlayerCallbacks
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.model = model;
    this.streaming = streaming;
    this.callbacks = callbacks;
  }

  get currentMs(): number {
    return this.clockMs;
  }

  get isPlaying(): boolean {
    return this.wantPlay;
  }

  setModel = (model: TBrowserReplayModel) => {
    const hadFrames = this.model.frames.length > 0;
    this.model = model;
    // A live session with nothing on screen yet opens on its newest frame once one arrives, rather
    // than replaying everything before it
    if (this.clockMs > model.totalMs || (this.streaming && this.wantPlay && !hadFrames)) {
      this.clockMs = model.totalMs;
    }
    this.present(this.clockMs);
    this.callbacks.onTick(this.clockMs);
  };

  setStreaming = (streaming: boolean) => {
    this.streaming = streaming;
  };

  setSpeed = (speed: number) => {
    this.speed = speed;
  };

  setSkipIdle = (skipIdle: boolean) => {
    this.skipIdle = skipIdle;
  };

  play = () => {
    if (this.wantPlay) return;
    if (!this.streaming && this.clockMs >= this.model.totalMs) this.clockMs = 0;
    this.wantPlay = true;
    this.callbacks.onPlayingChange(true);
    this.lastTick = null;
    if (this.raf === null) this.raf = requestAnimationFrame(this.tick);
  };

  pause = () => {
    this.stop();
    this.callbacks.onTick(this.clockMs);
  };

  seek = (ms: number) => {
    this.clockMs = Math.min(Math.max(ms, 0), this.model.totalMs);
    this.lastTick = null;
    this.setWaiting(false);
    this.present(this.clockMs);
    this.callbacks.onTick(this.clockMs);
  };

  dispose = () => {
    this.stop();
    this.cache.dispose();
  };

  private stop = () => {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.lastTick = null;
    this.setWaiting(false);
    if (this.wantPlay) {
      this.wantPlay = false;
      this.callbacks.onPlayingChange(false);
    }
  };

  private setWaiting = (waiting: boolean) => {
    if (this.waiting === waiting) return;
    this.waiting = waiting;
    this.callbacks.onWaitingChange(waiting);
  };

  private tick = (now: number) => {
    this.raf = null;
    if (!this.wantPlay) return;
    const elapsed = this.lastTick === null ? 0 : now - this.lastTick;
    this.lastTick = now;

    const { totalMs, activityMs } = this.model;
    let next = this.clockMs + elapsed * this.speed;
    if (this.skipIdle) next = skipIdleStretch(activityMs, next);

    if (next >= totalMs) {
      if (this.clockMs !== totalMs) {
        this.clockMs = totalMs;
        this.present(totalMs);
        this.callbacks.onTick(totalMs);
      }
      if (!this.streaming) {
        this.pause();
        return;
      }
      this.setWaiting(true);
    } else {
      this.setWaiting(false);
      this.clockMs = next;
      this.present(next);
      this.callbacks.onTick(next);
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  private present = (ms: number) => {
    const { frames } = this.model;
    // Before the first paint there is nothing to show, so its first frame stands in as a poster
    const frame = frameAt(frames, ms) ?? frames[0];
    if (!frame) return;
    this.wanted = frame;

    if (!this.drawn || frameKey(this.drawn) !== frameKey(frame)) {
      const cached = this.cache.get(frame);
      if (cached) {
        this.draw(frame, cached);
      } else {
        this.cache.load(frame).then((bitmap) => {
          const { wanted, drawn } = this;
          if (!bitmap || !wanted) return;
          // While playing forward, a frame that decoded late still beats the older one on screen
          const isWanted = frameKey(wanted) === frameKey(frame);
          const isStep =
            drawn !== null &&
            drawn.elapsedMs < frame.elapsedMs &&
            frame.elapsedMs < wanted.elapsedMs;
          if (isWanted || isStep) this.draw(frame, bitmap);
        });
      }
    }

    if (this.wantPlay) {
      const index = indexAtOrBefore(frames, ms);
      frames.slice(index + 1, index + 1 + PREFETCH_FRAMES).forEach((upcoming) => {
        this.cache.load(upcoming);
      });
    }
  };

  private draw = (frame: TBrowserFrame, bitmap: ImageBitmap) => {
    if (this.canvas.width !== bitmap.width || this.canvas.height !== bitmap.height) {
      this.canvas.width = bitmap.width;
      this.canvas.height = bitmap.height;
    }
    try {
      this.ctx.drawImage(bitmap, 0, 0);
    } catch {
      // the cache closed this bitmap to make room before it was drawn
      return;
    }
    this.drawn = frame;
    this.callbacks.onViewportChange(frame.width || bitmap.width, frame.height || bitmap.height);
  };
}
