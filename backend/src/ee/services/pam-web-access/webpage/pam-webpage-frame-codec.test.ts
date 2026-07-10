import { packFrame, unpackFrameHeader, WebPageClientMessageSchema } from "./pam-webpage-frame-codec";

test("packFrame/unpackFrameHeader round-trip", () => {
  const jpeg = Buffer.from([1, 2, 3, 4]);
  const packed = packFrame({ ts: 123456, w: 1280, h: 720, jpeg });
  const header = unpackFrameHeader(packed);
  expect(header).toEqual({ ts: 123456, w: 1280, h: 720, jpegOffset: 8 });
  expect(packed.subarray(8)).toEqual(jpeg);
});

test("client message schema accepts mouse, rejects junk", () => {
  expect(
    WebPageClientMessageSchema.safeParse({ type: "mouse", x: 1, y: 2, button: "left", action: "down" }).success
  ).toBe(true);
  expect(WebPageClientMessageSchema.safeParse({ type: "nope" }).success).toBe(false);
});
