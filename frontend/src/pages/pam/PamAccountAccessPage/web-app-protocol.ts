import { z } from "zod";

export enum WebAppFrameType {
  Jpeg = 1,
  Json = 2
}

const FRAME_HEADER_BYTES = 4;
export const MAX_SERVER_FRAME_BYTES = 32 * 1024 * 1024;
export const MAX_CLIENT_FRAME_BYTES = 1024 * 1024;
export const MAX_PASTE_CHARS = 64 * 1024;

export enum WebAppModifier {
  Alt = 1,
  Ctrl = 2,
  Meta = 4,
  Shift = 8
}

export type TWebAppFrame =
  | { type: WebAppFrameType.Jpeg; payload: Uint8Array<ArrayBuffer> }
  | { type: WebAppFrameType.Json; payload: Uint8Array<ArrayBuffer> };

export class WebAppProtocolError extends Error {}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

export const createWebAppFrameParser = (maxFrameBytes = MAX_SERVER_FRAME_BYTES) => {
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  const push = (chunk: Uint8Array<ArrayBuffer>): TWebAppFrame[] => {
    buffer = buffer.length === 0 ? chunk : concat(buffer, chunk);

    const frames: TWebAppFrame[] = [];
    let offset = 0;
    while (buffer.length - offset >= FRAME_HEADER_BYTES) {
      const length = new DataView(buffer.buffer, buffer.byteOffset + offset).getUint32(0, false);
      if (length < 1 || length > maxFrameBytes) {
        throw new WebAppProtocolError(`Invalid frame length ${length}`);
      }
      if (buffer.length - offset - FRAME_HEADER_BYTES < length) break;

      const start = offset + FRAME_HEADER_BYTES;
      const type = buffer[start];
      if (type !== WebAppFrameType.Jpeg && type !== WebAppFrameType.Json) {
        throw new WebAppProtocolError(`Unknown frame type ${type}`);
      }
      frames.push({ type, payload: buffer.slice(start + 1, start + length) });
      offset = start + length;
    }

    buffer = buffer.slice(offset);
    return frames;
  };

  return { push };
};

export type TWebAppMouseButton = "none" | "left" | "middle" | "right" | "back" | "forward";

export type TWebAppClientMessage =
  | {
      type: "mouse";
      action: "down" | "up" | "move" | "wheel";
      x: number;
      y: number;
      button: TWebAppMouseButton;
      buttons: number;
      clickCount: number;
      deltaX: number;
      deltaY: number;
      modifiers: number;
    }
  | {
      type: "key";
      action: "down" | "up";
      key: string;
      code: string;
      keyCode: number;
      modifiers: number;
    }
  | { type: "text"; text: string }
  | { type: "resize"; width: number; height: number; deviceScaleFactor?: number }
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" };

const textEncoder = new TextEncoder();

export const encodeClientMessage = (message: TWebAppClientMessage): Uint8Array<ArrayBuffer> => {
  const json = textEncoder.encode(JSON.stringify(message));
  const length = json.length + 1;
  if (length > MAX_CLIENT_FRAME_BYTES) {
    throw new WebAppProtocolError("Message is too large to send");
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + length);
  new DataView(frame.buffer).setUint32(0, length, false);
  frame[FRAME_HEADER_BYTES] = WebAppFrameType.Json;
  frame.set(json, FRAME_HEADER_BYTES + 1);
  return frame;
};

const WebAppServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    width: z.number(),
    height: z.number(),
    deviceScaleFactor: z.number().optional()
  }),
  z.object({
    type: z.literal("state"),
    url: z.string(),
    title: z.string(),
    canGoBack: z.boolean(),
    canGoForward: z.boolean()
  }),
  z.object({ type: z.literal("notice"), message: z.string() }),
  z.object({ type: z.literal("blocked"), url: z.string(), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() })
]);

export type TWebAppServerMessage = z.infer<typeof WebAppServerMessageSchema>;

const textDecoder = new TextDecoder();

// Unknown or malformed messages are dropped so a newer gateway can add message types.
export const decodeServerMessage = (payload: Uint8Array): TWebAppServerMessage | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(textDecoder.decode(payload));
  } catch {
    return null;
  }
  const parsed = WebAppServerMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const modifiersFromEvent = (event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number =>
  (event.altKey ? WebAppModifier.Alt : 0) +
  (event.ctrlKey ? WebAppModifier.Ctrl : 0) +
  (event.metaKey ? WebAppModifier.Meta : 0) +
  (event.shiftKey ? WebAppModifier.Shift : 0);

const DOM_BUTTONS: TWebAppMouseButton[] = ["left", "middle", "right", "back", "forward"];

export const mouseButtonFromEvent = (button: number): TWebAppMouseButton =>
  DOM_BUTTONS[button] ?? "none";

export const WHEEL_LINE_PIXELS = 16;

// The canvas is letterboxed inside its element (object-fit: contain), so a point is mapped through
// the drawn area rather than the element's full box.
export const mapPointToFrame = (
  point: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  frame: { width: number; height: number }
): { x: number; y: number } => {
  if (rect.width <= 0 || rect.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scale = Math.min(rect.width / frame.width, rect.height / frame.height);
  const offsetX = (rect.width - frame.width * scale) / 2;
  const offsetY = (rect.height - frame.height * scale) / 2;
  const x = (point.clientX - rect.left - offsetX) / scale;
  const y = (point.clientY - rect.top - offsetY) / scale;
  return {
    x: Math.round(Math.min(Math.max(x, 0), frame.width - 1)),
    y: Math.round(Math.min(Math.max(y, 0), frame.height - 1))
  };
};

export const MAX_DEVICE_SCALE_FACTOR = 2;
export const MAX_FRAME_SIDE = 3840;

// Mirrors the gateway's clamp, so the viewer divides input coordinates by the scale the frames use.
export const viewportScale = (devicePixelRatio: number, width: number, height: number): number => {
  const wanted = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DEVICE_SCALE_FACTOR);
  return Math.max(
    1,
    Math.min(wanted, MAX_FRAME_SIDE / Math.max(width, 1), MAX_FRAME_SIDE / Math.max(height, 1))
  );
};
