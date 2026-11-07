import {
  decodeWebFrame,
  encodeWebControl,
  lengthPrefixWebFrame,
  WebAttachSchema,
  WebFrameDecoder,
  WebFrameRateLimiter,
  WebFrameType,
  WebProtocolError
} from "./pam-web-app-protocol";
import vectors from "./protocol-vectors-v2.json";

describe("PAM Web App protocol v1", () => {
  test("encodes the platform attach vector byte-for-byte", () => {
    const vector = vectors.vectors.find((item) => item.name === "attach-control-tcp")!;
    const attach = WebAttachSchema.parse(vector.json);
    expect(encodeWebControl(attach).toString("hex")).toBe(vector.frameHex);
    expect(lengthPrefixWebFrame(encodeWebControl(attach)).toString("hex")).toBe(vector.tcpHex);
  });
  test("reassembles partial headers and multiple permitted frames", () => {
    const vector = vectors.vectors.find((item) => item.name === "tcp-split-reassembly")!;
    const decoder = new WebFrameDecoder();
    const actual: string[] = [];
    for (const part of vector.tcpHexParts!)
      decoder.push(Buffer.from(part, "hex"), (frame) => {
        decodeWebFrame(frame, "gateway");
        actual.push(frame.toString("hex"));
      });
    expect(actual).toEqual(vector.expectFrames);
  });
  test.each([
    "reject-input-from-gateway",
    "reject-frame-from-viewer",
    "reject-attach-from-viewer",
    "reject-unknown-type"
  ])("rejects %s", (name) => {
    const vector = vectors.vectors.find((item) => item.name === name)!;
    const frame = vector.frameHex
      ? Buffer.from(vector.frameHex, "hex")
      : Buffer.from(vector.tcpHex!, "hex").subarray(4);
    expect(() => decodeWebFrame(frame, name === "reject-input-from-gateway" ? "gateway" : "viewer")).toThrow(
      WebProtocolError
    );
  });
  test("refuses oversized allocation before accepting a body", () => {
    const decoder = new WebFrameDecoder();
    expect(() => decoder.push(Buffer.from("00100041", "hex"), () => {})).toThrow(WebProtocolError);
  });
  test("rejects malformed UTF-8, arrays, empty messages, and version mismatch", () => {
    for (const frame of [
      Buffer.from([1, 0xff]),
      Buffer.from([1]),
      Buffer.from([1, 91, 93]),
      encodeWebControl({ t: "attached", v: 2 })
    ])
      expect(() => decodeWebFrame(frame, "gateway")).toThrow(WebProtocolError);
  });
  test("validates the viewer action and input vectors", () => {
    for (const name of ["input-mouse-down", "control-navigate-reload", "control-dialog-answer"]) {
      const vector = vectors.vectors.find((item) => item.name === name)!;
      expect(decodeWebFrame(Buffer.from(vector.frameHex!, "hex"), "viewer").data).toEqual(vector.json);
    }
  });
  test("enforces byte limits and declared direction", () => {
    expect(() =>
      decodeWebFrame(
        Buffer.concat([Buffer.from([WebFrameType.Input]), Buffer.from(JSON.stringify({ text: "x".repeat(4096) }))]),
        "viewer"
      )
    ).toThrow(WebProtocolError);
    expect(() =>
      decodeWebFrame(
        encodeWebControl({ t: "navigate", seq: 1, surfaceSeq: 1, action: "reload", url: "https://example.com" }),
        "viewer"
      )
    ).toThrow(WebProtocolError);
  });
  test("limits sustained input while allowing the initial burst", () => {
    const limiter = new WebFrameRateLimiter(240, 600, 0);
    for (let n = 0; n < 600; n += 1) expect(limiter.accept(0)).toBe(true);
    expect(limiter.accept(0)).toBe(false);
    expect(limiter.accept(1000 / 240)).toBe(true);
    expect(limiter.accept(1000 / 240)).toBe(false);
  });
});
