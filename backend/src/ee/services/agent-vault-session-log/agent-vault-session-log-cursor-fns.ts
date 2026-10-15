import RE2 from "re2";
import { z } from "zod";

const CURSOR_VERSION = 2;
// Large enough for any S3 key, which can be up to 1,024 bytes, after JSON and base64.
const MAX_CURSOR_LENGTH = 8192;

export const SESSION_LOG_FEED_START = "0-0";

const HistoryCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("h"),
  after: z.string().min(1).max(1024)
});

const TailCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("t"),
  id: z.string().regex(new RE2(/^\d{1,16}-\d{1,16}$/))
});

const encode = (payload: object) => Buffer.from(JSON.stringify(payload)).toString("base64url");

const decode = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
};

// The name relative to the session folder, so a cursor can't point a list outside it.
export const encodeHistoryCursor = (after: string) => encode({ v: CURSOR_VERSION, m: "h", after });

export const encodeTailCursor = (feedEntryId: string) => encode({ v: CURSOR_VERSION, m: "t", id: feedEntryId });

const modeOf = (payload: unknown) =>
  payload && typeof payload === "object" && "m" in payload ? (payload as { m: unknown }).m : undefined;

export const HistoryCursorSchema = z
  .string()
  .trim()
  .max(MAX_CURSOR_LENGTH)
  .transform((cursor, ctx) => {
    const payload = decode(cursor);
    const parsed = HistoryCursorPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          modeOf(payload) === "t"
            ? "This cursor is for reading new logs as they arrive. Pass it to the session logs tail endpoint instead"
            : "Invalid cursor. Pass the nextCursor of a previous response unchanged"
      });
      return z.NEVER;
    }
    return parsed.data.after;
  });

export const TailCursorSchema = z
  .string()
  .trim()
  .max(MAX_CURSOR_LENGTH)
  .transform((cursor, ctx) => {
    const payload = decode(cursor);
    const parsed = TailCursorPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          modeOf(payload) === "h"
            ? "This cursor is for paging back through logs. Pass it to the session logs endpoint instead"
            : "Invalid cursor. Pass the nextCursor of a previous response unchanged"
      });
      return z.NEVER;
    }
    return parsed.data.id;
  });
