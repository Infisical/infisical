import { TextDecoder } from "node:util";

import { z } from "zod";

import { WebProtocolError } from "./pam-web-app-protocol-error";

export { WebProtocolError } from "./pam-web-app-protocol-error";
export { WebFrameRateLimiter } from "./pam-web-app-rate-limiter";

export const WEB_FRAME_LIMIT = 1024 * 1024 + 64;
export const WEB_CONTROL_LIMIT = 64 * 1024;
export const WEB_INPUT_LIMIT = 4 * 1024;
export const WEB_FRAME_HEADER_BYTES = 29;
export enum WebFrameType {
  Control = 1,
  Frame = 2,
  Input = 3
}

const u32 = z.number().int().min(0).max(0xffffffff);
const seq = u32.positive();
const surfaceSeq = u32.positive();
const boundedText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => Buffer.byteLength(value) <= max);
const modifiers = z.number().int().min(0).max(15);
const coordinate = z.number().int().min(-3840).max(3840);
const inputBase = z.object({ seq, surfaceSeq, viewportGen: u32 });
export const WebInputSchema = z.discriminatedUnion("kind", [
  inputBase.extend({
    kind: z.literal("mouse"),
    action: z.enum(["move", "down", "up"]),
    x: coordinate,
    y: coordinate,
    button: z.enum(["left", "middle", "right", "none"]),
    buttons: z.number().int().min(0).max(31),
    modifiers,
    clickCount: z.number().int().min(0).max(3)
  }),
  inputBase.extend({
    kind: z.literal("wheel"),
    x: coordinate,
    y: coordinate,
    deltaX: z.number().int().min(-65536).max(65536),
    deltaY: z.number().int().min(-65536).max(65536),
    modifiers
  }),
  inputBase.extend({
    kind: z.literal("key"),
    action: z.enum(["down", "up"]),
    key: boundedText(32),
    code: boundedText(32),
    modifiers,
    text: boundedText(8).optional()
  }),
  inputBase.extend({ kind: z.literal("text"), text: boundedText(WEB_CONTROL_LIMIT), source: z.enum(["ime", "type"]) })
]);
export const WebViewerControlSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("navigate"),
    seq,
    surfaceSeq,
    action: z.enum(["url", "back", "forward", "reload", "home"]),
    url: boundedText(2048).optional()
  }),
  z.object({
    t: z.literal("surface"),
    seq,
    action: z.enum(["activate", "close", "new"]),
    surfaceSeq: surfaceSeq.optional()
  }),
  z.object({
    t: z.literal("viewport"),
    seq,
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(240).max(2400),
    dpr: z.number().min(1).max(3)
  }),
  z.object({
    t: z.literal("dialog"),
    seq,
    surfaceSeq,
    dialogSeq: u32,
    accept: z.boolean(),
    promptText: boundedText(4096).optional()
  }),
  z.object({ t: z.literal("end"), seq }),
  z.object({ t: z.literal("ping") })
]);
export const WebAttachSchema = z.object({
  t: z.literal("attach"),
  v: z.literal(1),
  sessionId: z.string().uuid(),
  allocationGen: u32,
  controllerGen: u32,
  takeControl: z.boolean(),
  actor: z.object({ id: z.string().uuid(), email: z.string().email().max(320) }),
  issuedAt: z.string().datetime()
});
export type TWebAttach = z.infer<typeof WebAttachSchema>;

const gatewayControls = new Set([
  "attached",
  "phase",
  "controller_lost",
  "controller_busy",
  "surfaces",
  "nav",
  "viewport_ack",
  "dialog",
  "policy_denied",
  "health",
  "deadline",
  "ending",
  "ended",
  "error",
  "pong"
]);
const utf8 = new TextDecoder("utf-8", { fatal: true });
export const decodeWebFrame = (frame: Buffer, direction: "viewer" | "gateway") => {
  if (frame.length < 2 || frame.length > WEB_FRAME_LIMIT) throw new WebProtocolError();
  const type = frame[0] as WebFrameType;
  if (type === WebFrameType.Frame) {
    if (
      direction !== "gateway" ||
      frame.length <= WEB_FRAME_HEADER_BYTES ||
      frame.length > WEB_FRAME_HEADER_BYTES + 1024 * 1024
    )
      throw new WebProtocolError();
    if (
      frame.readUInt16BE(9) === 0 ||
      frame.readUInt16BE(11) === 0 ||
      frame.readUInt16BE(9) > 1920 ||
      frame.readUInt16BE(11) > 1200
    )
      throw new WebProtocolError();
    return { type, data: null };
  }
  if (
    (type !== WebFrameType.Control && type !== WebFrameType.Input) ||
    (type === WebFrameType.Input && direction !== "viewer")
  )
    throw new WebProtocolError();
  if (frame.length - 1 > (type === WebFrameType.Control ? WEB_CONTROL_LIMIT : WEB_INPUT_LIMIT))
    throw new WebProtocolError();
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(utf8.decode(frame.subarray(1)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new WebProtocolError();
    data = parsed as Record<string, unknown>;
    if (direction === "viewer") {
      if (type === WebFrameType.Input) WebInputSchema.parse(data);
      else {
        const control = WebViewerControlSchema.parse(data);
        if (control.t === "navigate" && (control.action === "url") !== (control.url !== undefined))
          throw new WebProtocolError();
        if (control.t === "surface" && control.action !== "new" && control.surfaceSeq === undefined)
          throw new WebProtocolError();
      }
    } else if (!gatewayControls.has(data.t as string) || (data.t === "attached" && data.v !== 1))
      throw new WebProtocolError();
  } catch {
    throw new WebProtocolError();
  }
  return { type, data };
};

export const encodeWebControl = (value: Record<string, unknown>) =>
  Buffer.concat([Buffer.from([WebFrameType.Control]), Buffer.from(JSON.stringify(value))]);
export const lengthPrefixWebFrame = (frame: Buffer) => {
  if (frame.length === 0 || frame.length > WEB_FRAME_LIMIT) throw new WebProtocolError();
  const header = Buffer.alloc(4);
  header.writeUInt32BE(frame.length);
  return Buffer.concat([header, frame]);
};

export class WebFrameDecoder {
  private header = Buffer.alloc(4);
  private headerOffset = 0;
  private payload: Buffer | null = null;
  private payloadOffset = 0;

  push(bytes: Buffer, onFrame: (frame: Buffer) => void) {
    let offset = 0;
    while (offset < bytes.length) {
      if (!this.payload) {
        const n = Math.min(4 - this.headerOffset, bytes.length - offset);
        bytes.copy(this.header, this.headerOffset, offset, offset + n);
        this.headerOffset += n;
        offset += n;
        if (this.headerOffset !== 4) continue;
        const size = this.header.readUInt32BE();
        if (size < 2 || size > WEB_FRAME_LIMIT) throw new WebProtocolError();
        this.payload = Buffer.alloc(size);
        this.payloadOffset = 0;
        this.headerOffset = 0;
      }
      const n = Math.min(this.payload.length - this.payloadOffset, bytes.length - offset);
      bytes.copy(this.payload, this.payloadOffset, offset, offset + n);
      offset += n;
      this.payloadOffset += n;
      if (this.payloadOffset === this.payload.length) {
        const frame = this.payload;
        this.payload = null;
        onFrame(frame);
      }
    }
  }
}
