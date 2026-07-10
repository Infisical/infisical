import { TWebFrameEvent } from "@app/hooks/api/pam/session-playback/types";

export class WebReplayPlayer {
  private frames: TWebFrameEvent[] = [];

  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setFrames(frames: TWebFrameEvent[]) {
    this.frames = [...frames].sort((a, b) => a.elapsedMs - b.elapsedMs);
  }

  get totalMs(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].elapsedMs : 0;
  }

  async drawAt(ms: number): Promise<void> {
    // Binary search for the last frame with elapsedMs <= ms (frames sorted ascending)
    let lo = 0;
    let hi = this.frames.length - 1;
    let targetIdx = -1;
    while (lo <= hi) {
      // eslint-disable-next-line no-bitwise
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].elapsedMs <= ms) {
        targetIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const target: TWebFrameEvent | undefined = targetIdx >= 0 ? this.frames[targetIdx] : undefined;
    if (!target) return;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = `data:image/jpeg;base64,${target.jpegBase64}`;
    });
    this.ctx.canvas.width = target.w;
    this.ctx.canvas.height = target.h;
    this.ctx.drawImage(img, 0, 0);
  }
}
