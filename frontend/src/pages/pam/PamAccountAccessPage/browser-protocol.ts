import { z } from "zod";

// Wire protocol between the web-app viewer and the gateway's browser controller. The backend relays
// bytes without reading them and does not keep WebSocket message boundaries, so both directions are
// a byte stream of length-prefixed messages.

const LENGTH_FIELD_BYTES = 4;
const MESSAGE_HEADER_BYTES = LENGTH_FIELD_BYTES + 1;
const FRAME_HEADER_BYTES = 12;
const INITIAL_DECODER_CAPACITY = 64 * 1024;

export const MAX_BROWSER_MESSAGE_LENGTH = 4 * 1024 * 1024;
// The backend caps viewer messages at 64 KiB; staying under 48 KiB leaves headroom
export const MAX_VIEWER_MESSAGE_BYTES = 48 * 1024;
export const MAX_TEXT_INPUT_BYTES = 32 * 1024;

const MIN_VIEWPORT_WIDTH = 320;
const MAX_VIEWPORT_WIDTH = 3840;
const MIN_VIEWPORT_HEIGHT = 240;
const MAX_VIEWPORT_HEIGHT = 2160;

const WHEEL_LINE_HEIGHT_PX = 16;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export enum BrowserMessageType {
  Frame = 0x01,
  Control = 0x02
}

export enum BrowserControllerMessageType {
  Ready = "ready",
  Url = "url",
  Cursor = "cursor",
  Dialog = "dialog",
  Blocked = "blocked",
  End = "end"
}

export enum BrowserViewerMessageType {
  Resize = "resize",
  Mouse = "mouse",
  Wheel = "wheel",
  Key = "key",
  Text = "text",
  DialogReply = "dialog_reply",
  End = "end"
}

export enum BrowserDialogKind {
  Alert = "alert",
  Confirm = "confirm",
  Prompt = "prompt",
  BeforeUnload = "beforeunload"
}

export enum BrowserEndReason {
  Completed = "completed",
  Expired = "expired",
  Terminated = "terminated",
  Idle = "idle",
  UserQuit = "user_quit",
  BrowserStopped = "browser_stopped",
  Capacity = "capacity",
  Error = "error"
}

export enum BrowserMouseAction {
  Move = "move",
  Down = "down",
  Up = "up"
}

export enum BrowserMouseButton {
  None = "none",
  Left = "left",
  Middle = "middle",
  Right = "right"
}

export enum BrowserKeyAction {
  Down = "down",
  Up = "up"
}

// Matches CDP's Input.dispatch*Event modifiers
export enum BrowserModifier {
  Alt = 1,
  Ctrl = 2,
  Meta = 4,
  Shift = 8
}

export type TBrowserFrame = {
  seq: number;
  elapsedMs: number;
  width: number;
  height: number;
  jpeg: Uint8Array;
};

export type TBrowserStreamMessage =
  | { type: BrowserMessageType.Frame; frame: TBrowserFrame }
  | { type: BrowserMessageType.Control; data: Record<string, unknown> };

// Dialog ids are echoed back verbatim, so either JSON scalar the controller picks is accepted
const DialogIdSchema = z.union([z.string(), z.number()]);

const BrowserControllerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(BrowserControllerMessageType.Ready),
    url: z.string(),
    width: z.number(),
    height: z.number()
  }),
  z.object({
    type: z.literal(BrowserControllerMessageType.Url),
    url: z.string(),
    title: z.string()
  }),
  z.object({
    type: z.literal(BrowserControllerMessageType.Cursor),
    cursor: z.string()
  }),
  z.object({
    type: z.literal(BrowserControllerMessageType.Dialog),
    id: DialogIdSchema,
    // Left open so a kind added later still gets an answer instead of hanging the remote page
    kind: z.string(),
    message: z.string(),
    defaultPrompt: z.string().optional()
  }),
  z.object({
    type: z.literal(BrowserControllerMessageType.Blocked),
    url: z.string(),
    reason: z.string()
  }),
  z.object({
    type: z.literal(BrowserControllerMessageType.End),
    reason: z.string(),
    message: z.string().optional()
  })
]);

export type TBrowserControllerMessage = z.infer<typeof BrowserControllerMessageSchema>;

export type TBrowserDialogMessage = Extract<
  TBrowserControllerMessage,
  { type: BrowserControllerMessageType.Dialog }
>;

export type TBrowserViewport = { width: number; height: number };

export type TBrowserResizeMessage = {
  type: BrowserViewerMessageType.Resize;
  width: number;
  height: number;
  dpr: number;
};

export type TBrowserMouseMessage = {
  type: BrowserViewerMessageType.Mouse;
  action: BrowserMouseAction;
  x: number;
  y: number;
  button: BrowserMouseButton;
  buttons: number;
  clickCount: number;
  modifiers: number;
};

export type TBrowserWheelMessage = {
  type: BrowserViewerMessageType.Wheel;
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  modifiers: number;
};

export type TBrowserKeyMessage = {
  type: BrowserViewerMessageType.Key;
  action: BrowserKeyAction;
  key: string;
  code: string;
  keyCode: number;
  modifiers: number;
  text?: string;
};

export type TBrowserTextMessage = {
  type: BrowserViewerMessageType.Text;
  text: string;
};

export type TBrowserDialogReplyMessage = {
  type: BrowserViewerMessageType.DialogReply;
  id: string | number;
  accept: boolean;
  promptText?: string;
};

export type TBrowserEndMessage = {
  type: BrowserViewerMessageType.End;
};

export type TBrowserViewerMessage =
  | TBrowserResizeMessage
  | TBrowserMouseMessage
  | TBrowserWheelMessage
  | TBrowserKeyMessage
  | TBrowserTextMessage
  | TBrowserDialogReplyMessage
  | TBrowserEndMessage;

export class BrowserProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserProtocolError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const decodeFramePayload = (payload: Uint8Array): TBrowserFrame | null => {
  if (payload.byteLength < FRAME_HEADER_BYTES) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    seq: view.getUint32(0),
    elapsedMs: view.getUint32(4),
    width: view.getUint16(8),
    height: view.getUint16(10),
    jpeg: payload.subarray(FRAME_HEADER_BYTES)
  };
};

const decodeControlPayload = (payload: Uint8Array): Record<string, unknown> | null => {
  try {
    const data: unknown = JSON.parse(textDecoder.decode(payload));
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    // A CONTROL payload that is not JSON is skipped like an unknown message
  }
  return null;
};

export const createBrowserStreamDecoder = () => {
  let buffer = new Uint8Array(INITIAL_DECODER_CAPACITY);
  let start = 0;
  let end = 0;
  let hasFailed = false;

  const append = (chunk: Uint8Array) => {
    if (buffer.byteLength - end < chunk.byteLength) {
      const pending = end - start;
      const required = pending + chunk.byteLength;
      if (required > buffer.byteLength) {
        let capacity = buffer.byteLength;
        while (capacity < required) capacity *= 2;
        const grown = new Uint8Array(capacity);
        grown.set(buffer.subarray(start, end));
        buffer = grown;
      } else {
        buffer.copyWithin(0, start, end);
      }
      start = 0;
      end = pending;
    }
    buffer.set(chunk, end);
    end += chunk.byteLength;
  };

  const push = (chunk: ArrayBufferLike | Uint8Array): TBrowserStreamMessage[] => {
    if (hasFailed) throw new BrowserProtocolError("The stream has already failed");
    append(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));

    const messages: TBrowserStreamMessage[] = [];
    while (end - start >= LENGTH_FIELD_BYTES) {
      const length = new DataView(buffer.buffer, start, LENGTH_FIELD_BYTES).getUint32(0);
      // Zero cannot hold the type byte: the stream is out of step and nothing after it is readable
      if (length === 0 || length > MAX_BROWSER_MESSAGE_LENGTH) {
        hasFailed = true;
        throw new BrowserProtocolError(`Invalid message length ${length}`);
      }
      if (end - start < LENGTH_FIELD_BYTES + length) break;

      const messageEnd = start + LENGTH_FIELD_BYTES + length;
      const type = buffer[start + LENGTH_FIELD_BYTES];
      // Copied out because the buffer is reused for the next chunk
      const payload = buffer.slice(start + MESSAGE_HEADER_BYTES, messageEnd);
      start = messageEnd;

      if (type === BrowserMessageType.Frame) {
        const frame = decodeFramePayload(payload);
        if (frame) messages.push({ type: BrowserMessageType.Frame, frame });
      } else if (type === BrowserMessageType.Control) {
        const data = decodeControlPayload(payload);
        if (data) messages.push({ type: BrowserMessageType.Control, data });
      }
    }

    if (start === end) {
      start = 0;
      end = 0;
    }
    return messages;
  };

  return { push };
};

export const parseBrowserControllerMessage = (data: unknown): TBrowserControllerMessage | null => {
  const parsed = BrowserControllerMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

export const encodeBrowserMessage = (type: BrowserMessageType, payload: Uint8Array): Uint8Array => {
  const message = new Uint8Array(MESSAGE_HEADER_BYTES + payload.byteLength);
  new DataView(message.buffer).setUint32(0, payload.byteLength + 1);
  message[LENGTH_FIELD_BYTES] = type;
  message.set(payload, MESSAGE_HEADER_BYTES);
  return message;
};

export const encodeControlMessage = (message: TBrowserViewerMessage): Uint8Array =>
  encodeBrowserMessage(BrowserMessageType.Control, textEncoder.encode(JSON.stringify(message)));

export const clampViewport = (width: number, height: number): TBrowserViewport => ({
  width: clamp(Math.floor(width), MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH),
  height: clamp(Math.floor(height), MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT)
});

export const encodeResize = ({ width, height, dpr }: Omit<TBrowserResizeMessage, "type">) =>
  encodeControlMessage({
    type: BrowserViewerMessageType.Resize,
    ...clampViewport(width, height),
    dpr
  });

export const encodeMouse = (message: Omit<TBrowserMouseMessage, "type">) =>
  encodeControlMessage({ type: BrowserViewerMessageType.Mouse, ...message });

export const encodeWheel = (message: Omit<TBrowserWheelMessage, "type">) =>
  encodeControlMessage({ type: BrowserViewerMessageType.Wheel, ...message });

export const encodeKey = (message: Omit<TBrowserKeyMessage, "type">) =>
  encodeControlMessage({ type: BrowserViewerMessageType.Key, ...message });

// Cuts on a code point boundary: encodeInto only writes whole UTF-8 sequences
export const truncateUtf8 = (text: string, maxBytes: number): string => {
  if (text.length * 3 <= maxBytes) return text;
  const { read } = textEncoder.encodeInto(text, new Uint8Array(maxBytes));
  return text.slice(0, read);
};

const encodeTextWithin = (text: string, budget: number): Uint8Array => {
  const message = encodeControlMessage({
    type: BrowserViewerMessageType.Text,
    text: truncateUtf8(text, budget)
  });
  if (message.byteLength <= MAX_VIEWER_MESSAGE_BYTES || budget === 0) return message;
  // JSON escaping can grow control characters up to sixfold, past the backend's message cap
  return encodeTextWithin(
    text,
    Math.floor((budget * MAX_VIEWER_MESSAGE_BYTES) / message.byteLength)
  );
};

export const encodeText = (text: string) => encodeTextWithin(text, MAX_TEXT_INPUT_BYTES);

export const encodeDialogReply = (message: Omit<TBrowserDialogReplyMessage, "type">) =>
  encodeControlMessage({ type: BrowserViewerMessageType.DialogReply, ...message });

export const encodeEnd = () => encodeControlMessage({ type: BrowserViewerMessageType.End });

export const getModifierMask = (event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number =>
  (event.altKey ? BrowserModifier.Alt : 0) +
  (event.ctrlKey ? BrowserModifier.Ctrl : 0) +
  (event.metaKey ? BrowserModifier.Meta : 0) +
  (event.shiftKey ? BrowserModifier.Shift : 0);

// MouseEvent.buttons already uses left 1, right 2, middle 4; back and forward (8, 16) are not in
// the protocol, and the remainder keeps only the low three bits
export const getHeldButtonsMask = (buttons: number) => buttons % 8;

const MOUSE_BUTTONS: Record<number, BrowserMouseButton> = {
  0: BrowserMouseButton.Left,
  1: BrowserMouseButton.Middle,
  2: BrowserMouseButton.Right
};

export const toBrowserMouseButton = (button: number): BrowserMouseButton | null =>
  MOUSE_BUTTONS[button] ?? null;

// Indexed by the held-buttons mask. CDP needs the held button on moves for drags and text selection
// to register, and DOM mousemove events do not carry one.
const MOVE_BUTTON_BY_MASK = [
  BrowserMouseButton.None,
  BrowserMouseButton.Left,
  BrowserMouseButton.Right,
  BrowserMouseButton.Left,
  BrowserMouseButton.Middle,
  BrowserMouseButton.Left,
  BrowserMouseButton.Right,
  BrowserMouseButton.Left
];

export const getMoveButton = (buttons: number) => MOVE_BUTTON_BY_MASK[getHeldButtonsMask(buttons)];

export const toViewportPoint = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewport: TBrowserViewport
) => ({
  x: Math.round(
    clamp(((clientX - rect.left) * viewport.width) / rect.width, 0, viewport.width - 1)
  ),
  y: Math.round(
    clamp(((clientY - rect.top) * viewport.height) / rect.height, 0, viewport.height - 1)
  )
});

export const wheelDeltaToPixels = (delta: number, deltaMode: number, viewportHeight: number) => {
  if (deltaMode === DOM_DELTA_LINE) return delta * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === DOM_DELTA_PAGE) return delta * viewportHeight;
  return delta;
};
