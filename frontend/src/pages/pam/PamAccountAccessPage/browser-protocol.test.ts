import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  BrowserControllerMessageType,
  BrowserKeyAction,
  BrowserMessageType,
  BrowserProtocolError,
  BrowserViewerMessageType,
  createBrowserStreamDecoder,
  encodeBrowserMessage,
  encodeKey,
  encodeResize,
  encodeText,
  MAX_BROWSER_MESSAGE_LENGTH,
  MAX_TEXT_INPUT_BYTES,
  MAX_VIEWER_MESSAGE_BYTES,
  parseBrowserControllerMessage,
  TBrowserFrame
} from "./browser-protocol";

const textEncoder = new TextEncoder();

const buildFrameMessage = ({ seq, elapsedMs, width, height, jpeg }: TBrowserFrame) => {
  const payload = new Uint8Array(12 + jpeg.byteLength);
  const view = new DataView(payload.buffer);
  view.setUint32(0, seq);
  view.setUint32(4, elapsedMs);
  view.setUint16(8, width);
  view.setUint16(10, height);
  payload.set(jpeg, 12);
  return encodeBrowserMessage(BrowserMessageType.Frame, payload);
};

const buildControlMessage = (data: Record<string, unknown>) =>
  encodeBrowserMessage(BrowserMessageType.Control, textEncoder.encode(JSON.stringify(data)));

// A WebSocket delivers each message as its own ArrayBuffer
const toChunk = (bytes: Uint8Array) => bytes.slice().buffer;

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.byteLength;
  }, 0);
  return out;
};

const lengthPrefix = (length: number) => {
  const header = new Uint8Array(5);
  new DataView(header.buffer).setUint32(0, length);
  header[4] = BrowserMessageType.Frame;
  return header;
};

const frame: TBrowserFrame = {
  seq: 7,
  elapsedMs: 123_456,
  width: 1280,
  height: 720,
  jpeg: Uint8Array.from({ length: 5000 }, (_, i) => i % 251)
};

describe("createBrowserStreamDecoder", () => {
  it("reassembles a frame split across chunks, including inside the length prefix", () => {
    const message = buildFrameMessage(frame);
    const decoder = createBrowserStreamDecoder();

    assert.deepEqual(decoder.push(toChunk(message.subarray(0, 2))), []);
    assert.deepEqual(decoder.push(toChunk(message.subarray(2, 9))), []);
    assert.deepEqual(decoder.push(toChunk(message.subarray(9, 3000))), []);
    assert.deepEqual(decoder.push(toChunk(message.subarray(3000))), [
      { type: BrowserMessageType.Frame, frame }
    ]);
  });

  it("emits every message when several arrive in one chunk, and keeps the trailing partial", () => {
    const ready = {
      type: BrowserControllerMessageType.Ready,
      url: "https://grafana.internal/",
      width: 1280,
      height: 720
    };
    const cursor = { type: BrowserControllerMessageType.Cursor, cursor: "pointer" };
    const url = {
      type: BrowserControllerMessageType.Url,
      url: "https://grafana.internal/d/1",
      title: "Dashboard"
    };
    const unknownType = encodeBrowserMessage(0x7f as BrowserMessageType, new Uint8Array([1, 2, 3]));
    const trailing = buildControlMessage(url);
    const decoder = createBrowserStreamDecoder();

    const messages = decoder.push(
      toChunk(
        concat(
          buildControlMessage(ready),
          buildFrameMessage(frame),
          unknownType,
          buildControlMessage(cursor),
          trailing.subarray(0, 10)
        )
      )
    );

    assert.deepEqual(messages, [
      { type: BrowserMessageType.Control, data: ready },
      { type: BrowserMessageType.Frame, frame },
      { type: BrowserMessageType.Control, data: cursor }
    ]);
    assert.deepEqual(decoder.push(toChunk(trailing.subarray(10))), [
      { type: BrowserMessageType.Control, data: url }
    ]);
  });

  it("round trips CONTROL JSON in both directions", () => {
    const decoder = createBrowserStreamDecoder();
    const key = {
      action: BrowserKeyAction.Down,
      key: "é",
      code: "KeyE",
      keyCode: 69,
      modifiers: 8,
      text: "é"
    };

    assert.deepEqual(decoder.push(toChunk(encodeKey(key))), [
      { type: BrowserMessageType.Control, data: { type: BrowserViewerMessageType.Key, ...key } }
    ]);

    const dialog = {
      type: BrowserControllerMessageType.Dialog,
      id: "d-1",
      kind: "prompt",
      message: "Name the dashboard",
      defaultPrompt: "Untitled"
    };
    const [decoded] = decoder.push(toChunk(buildControlMessage(dialog)));
    assert.ok(decoded.type === BrowserMessageType.Control);
    assert.deepEqual(parseBrowserControllerMessage(decoded.data), dialog);
  });

  it("accepts a length of exactly 4 MiB but fails the stream on anything larger", () => {
    assert.deepEqual(
      createBrowserStreamDecoder().push(toChunk(lengthPrefix(MAX_BROWSER_MESSAGE_LENGTH))),
      []
    );

    const decoder = createBrowserStreamDecoder();
    assert.throws(
      () => decoder.push(toChunk(lengthPrefix(MAX_BROWSER_MESSAGE_LENGTH + 1))),
      BrowserProtocolError
    );
    assert.throws(() => decoder.push(toChunk(buildFrameMessage(frame))), BrowserProtocolError);
  });
});

describe("viewer encoders", () => {
  it("clamps resize to the supported viewport", () => {
    const [resize] = createBrowserStreamDecoder().push(
      toChunk(encodeResize({ width: 100.7, height: 9000, dpr: 2 }))
    );
    assert.deepEqual(resize, {
      type: BrowserMessageType.Control,
      data: { type: BrowserViewerMessageType.Resize, width: 320, height: 2160, dpr: 2 }
    });
  });

  it("caps text at 32 KiB of UTF-8 without splitting a character", () => {
    const [decoded] = createBrowserStreamDecoder().push(toChunk(encodeText("😀".repeat(20_000))));
    assert.ok(decoded.type === BrowserMessageType.Control);
    assert.equal(decoded.data.text, "😀".repeat(MAX_TEXT_INPUT_BYTES / 4));
  });

  it("keeps escaped text under the per-message limit", () => {
    const message = encodeText("\u0001".repeat(MAX_TEXT_INPUT_BYTES));
    assert.ok(message.byteLength <= MAX_VIEWER_MESSAGE_BYTES);
  });
});
