import { frameKey, TBrowserFrame } from "./browserReplay";

const decodeBase64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// A decoded frame holds its full pixel buffer, so only the frames around the playhead are kept
export class BrowserFrameCache {
  private bitmaps = new Map<string, ImageBitmap>();

  private pending = new Map<string, Promise<ImageBitmap | null>>();

  private failed = new Set<string>();

  private capacity: number;

  private disposed = false;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get = (frame: TBrowserFrame): ImageBitmap | undefined => {
    const key = frameKey(frame);
    const bitmap = this.bitmaps.get(key);
    if (bitmap) {
      this.bitmaps.delete(key);
      this.bitmaps.set(key, bitmap);
    }
    return bitmap;
  };

  load = (frame: TBrowserFrame): Promise<ImageBitmap | null> => {
    const cached = this.get(frame);
    if (cached) return Promise.resolve(cached);
    const key = frameKey(frame);
    if (this.failed.has(key)) return Promise.resolve(null);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const decode = async () => {
      const jpeg = frame.readJpeg();
      if (!jpeg) throw new Error("Frame has no image");
      const bitmap = await createImageBitmap(
        new Blob([decodeBase64ToBytes(jpeg)], { type: "image/jpeg" })
      );
      if (this.disposed) {
        bitmap.close();
        return null;
      }
      this.store(key, bitmap);
      return bitmap;
    };

    const promise = decode()
      .catch(() => {
        this.failed.add(key);
        return null;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  };

  dispose = () => {
    this.disposed = true;
    this.bitmaps.forEach((bitmap) => bitmap.close());
    this.bitmaps.clear();
    this.pending.clear();
  };

  private store = (key: string, bitmap: ImageBitmap) => {
    this.bitmaps.set(key, bitmap);
    while (this.bitmaps.size > this.capacity) {
      const [oldestKey, oldest] = this.bitmaps.entries().next().value as [string, ImageBitmap];
      oldest.close();
      this.bitmaps.delete(oldestKey);
    }
  };
}
