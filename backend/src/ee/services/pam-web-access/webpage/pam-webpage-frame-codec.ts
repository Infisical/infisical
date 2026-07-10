import { z } from "zod";

// Server->client binary frame: [ts:u32 LE][w:u16 LE][h:u16 LE][...jpeg]
export const packFrame = ({ ts, w, h, jpeg }: { ts: number; w: number; h: number; jpeg: Buffer }): Buffer => {
  const header = Buffer.alloc(8);
  // wrap the timestamp into unsigned 32-bit range without bitwise ops (eslint no-bitwise)
  header.writeUInt32LE(((ts % 0x1_0000_0000) + 0x1_0000_0000) % 0x1_0000_0000, 0);
  header.writeUInt16LE(w, 4);
  header.writeUInt16LE(h, 6);
  return Buffer.concat([header, jpeg]);
};

export const unpackFrameHeader = (buf: Buffer) => ({
  ts: buf.readUInt32LE(0),
  w: buf.readUInt16LE(4),
  h: buf.readUInt16LE(6),
  jpegOffset: 8
});

export const WebPageClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mouse"),
    x: z.number(),
    y: z.number(),
    button: z.enum(["left", "middle", "right"]),
    action: z.enum(["move", "down", "up", "click"])
  }),
  z.object({
    type: z.literal("key"),
    key: z.string().max(64),
    code: z.string().max(64).optional(),
    action: z.enum(["down", "up"])
  }),
  z.object({ type: z.literal("scroll"), x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }),
  z.object({ type: z.literal("navigate"), url: z.string().max(2048) }),
  z.object({
    type: z.literal("resize"),
    w: z.number().int().min(320).max(3840),
    h: z.number().int().min(240).max(2160)
  })
]);

export type TWebPageClientMessage = z.infer<typeof WebPageClientMessageSchema>;
