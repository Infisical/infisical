import { describe, expect, test } from "vitest";

import {
  decodeServerMessage,
  createWebAppFrameParser,
  encodeClientMessage,
  mapPointToFrame,
  MAX_CLIENT_FRAME_BYTES,
  modifiersFromEvent,
  mouseButtonFromEvent,
  viewportScale,
  WebAppFrameType,
  WebAppProtocolError
} from "./web-app-protocol";

const frame = (type: number, payload: Uint8Array | string) => {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const out = new Uint8Array(5 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length + 1, false);
  out[4] = type;
  out.set(bytes, 5);
  return out;
};

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  parts.forEach((p) => {
    out.set(p, offset);
    offset += p.length;
  });
  return out;
};

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const ready = JSON.stringify({ type: "ready", width: 1280, height: 800 });

describe("WebAppFrameParser", () => {
  test("cuts one whole frame", () => {
    const frames = createWebAppFrameParser().push(frame(WebAppFrameType.Jpeg, jpeg));
    expect(frames).toEqual([{ type: WebAppFrameType.Jpeg, payload: jpeg }]);
  });

  test("reassembles a frame split across messages, including inside the header", () => {
    const parser = createWebAppFrameParser();
    const bytes = frame(WebAppFrameType.Json, ready);

    expect(parser.push(bytes.slice(0, 2))).toEqual([]);
    expect(parser.push(bytes.slice(2, 7))).toEqual([]);
    const frames = parser.push(bytes.slice(7));

    expect(frames).toHaveLength(1);
    expect(decodeServerMessage(frames[0].payload)).toEqual({
      type: "ready",
      width: 1280,
      height: 800
    });
  });

  test("cuts several frames from one message and keeps the partial tail", () => {
    const parser = createWebAppFrameParser();
    const tail = frame(WebAppFrameType.Jpeg, jpeg);
    const bytes = join(
      frame(WebAppFrameType.Json, ready),
      frame(WebAppFrameType.Jpeg, jpeg),
      tail.slice(0, 6)
    );

    const first = parser.push(bytes);
    expect(first.map((f) => f.type)).toEqual([WebAppFrameType.Json, WebAppFrameType.Jpeg]);

    expect(parser.push(tail.slice(6))).toEqual([{ type: WebAppFrameType.Jpeg, payload: jpeg }]);
  });

  test("accepts a frame with an empty payload", () => {
    expect(createWebAppFrameParser().push(frame(WebAppFrameType.Jpeg, new Uint8Array()))).toEqual([
      { type: WebAppFrameType.Jpeg, payload: new Uint8Array() }
    ]);
  });

  test("refuses a zero length", () => {
    expect(() => createWebAppFrameParser().push(new Uint8Array([0, 0, 0, 0, 1]))).toThrow(
      WebAppProtocolError
    );
  });

  test("refuses a frame over the size limit from its header alone", () => {
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, 1025, false);
    expect(() => createWebAppFrameParser(1024).push(header)).toThrow(WebAppProtocolError);

    new DataView(header.buffer).setUint32(0, 1024, false);
    expect(createWebAppFrameParser(1024).push(header)).toEqual([]);
  });

  test("refuses an unknown frame type", () => {
    expect(() => createWebAppFrameParser().push(frame(3, "x"))).toThrow(WebAppProtocolError);
  });
});

describe("encodeClientMessage", () => {
  test("round-trips through the parser as a JSON frame", () => {
    const bytes = encodeClientMessage({ type: "resize", width: 1280, height: 800 });
    const [decoded] = createWebAppFrameParser().push(bytes);

    expect(decoded.type).toBe(WebAppFrameType.Json);
    expect(JSON.parse(new TextDecoder().decode(decoded.payload))).toEqual({
      type: "resize",
      width: 1280,
      height: 800
    });
  });

  test("counts the length in UTF-8 bytes", () => {
    const bytes = encodeClientMessage({ type: "text", text: "héllo 👋" });
    const length = new DataView(bytes.buffer).getUint32(0, false);
    expect(length).toBe(bytes.length - 4);
  });

  test("refuses a message over the client frame limit", () => {
    expect(() =>
      encodeClientMessage({ type: "text", text: "a".repeat(MAX_CLIENT_FRAME_BYTES) })
    ).toThrow(WebAppProtocolError);
  });
});

describe("decodeServerMessage", () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

  test("parses each server message", () => {
    expect(
      decodeServerMessage(
        encode({
          type: "state",
          url: "https://grafana.internal/",
          title: "Grafana",
          canGoBack: false,
          canGoForward: false
        })
      )
    ).toMatchObject({ type: "state", title: "Grafana" });
    expect(
      decodeServerMessage(encode({ type: "blocked", url: "https://x/", message: "Blocked" }))
    ).toMatchObject({ type: "blocked" });
    expect(decodeServerMessage(encode({ type: "error", message: "Boom" }))).toMatchObject({
      type: "error"
    });
  });

  test("drops unknown and malformed messages", () => {
    expect(decodeServerMessage(encode({ type: "future", value: 1 }))).toBeNull();
    expect(decodeServerMessage(encode({ type: "ready", width: "wide" }))).toBeNull();
    expect(decodeServerMessage(new TextEncoder().encode("{not json"))).toBeNull();
  });
});

describe("input mapping", () => {
  test("modifiers use CDP's bit field", () => {
    expect(
      modifiersFromEvent({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })
    ).toBe(1);
    expect(
      modifiersFromEvent({ altKey: false, ctrlKey: true, metaKey: true, shiftKey: true })
    ).toBe(14);
  });

  test("DOM button numbers map to CDP button names", () => {
    expect([0, 1, 2, 3, 4, 7].map(mouseButtonFromEvent)).toEqual([
      "left",
      "middle",
      "right",
      "back",
      "forward",
      "none"
    ]);
  });
});

describe("mapPointToFrame", () => {
  const rect = { left: 100, top: 50, width: 1280, height: 800 };

  test("maps one to one when the frame fills the element", () => {
    expect(
      mapPointToFrame({ clientX: 110, clientY: 60 }, rect, { width: 1280, height: 800 })
    ).toEqual({
      x: 10,
      y: 10
    });
  });

  test("scales through the letterboxed area", () => {
    const frameSize = { width: 640, height: 800 };
    expect(
      mapPointToFrame({ clientX: 100 + 320 + 320, clientY: 50 + 400 }, rect, frameSize)
    ).toEqual({
      x: 320,
      y: 400
    });
  });

  test("clamps points outside the frame to its edges", () => {
    const frameSize = { width: 1280, height: 800 };
    expect(mapPointToFrame({ clientX: 0, clientY: 0 }, rect, frameSize)).toEqual({ x: 0, y: 0 });
    expect(mapPointToFrame({ clientX: 5000, clientY: 5000 }, rect, frameSize)).toEqual({
      x: 1279,
      y: 799
    });
  });
});

describe("viewportScale", () => {
  test("follows the screen's pixel ratio between 1 and 2", () => {
    expect(viewportScale(1, 1280, 800)).toBe(1);
    expect(viewportScale(1.5, 1280, 800)).toBe(1.5);
    expect(viewportScale(2, 1280, 800)).toBe(2);
    expect(viewportScale(3, 1280, 800)).toBe(2);
    expect(viewportScale(0.5, 1280, 800)).toBe(1);
    expect(viewportScale(Number.NaN, 1280, 800)).toBe(1);
  });

  test("keeps frames within 3840 pixels on each side", () => {
    expect(viewportScale(2, 2560, 1440)).toBe(1.5);
    expect(viewportScale(2, 1280, 2400)).toBe(1.6);
    expect(viewportScale(2, 3840, 2160)).toBe(1);
  });
});
