import { describe, expect, test } from "vitest";

import vectors from "./protocol-vectors-v2.json";
import {
  encodeWebAppMessage,
  isCurrentWebAppFrame,
  parseWebAppFrame,
  remoteCoordinates
} from "./web-app-protocol";

const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16)).buffer;
describe("Web App browser protocol", () => {
  test("decodes the shared 32-bit generation and timestamp frame vector", () => {
    const vector = vectors.vectors.find((entry) => entry.name === "frame-minimal-jpeg")!;
    const frame = parseWebAppFrame(bytes(vector.frameHex!));
    expect(frame).toMatchObject({ type: "frame", ...vector.header });
    if (frame.type !== "frame") throw new Error("Expected display frame");
    expect(isCurrentWebAppFrame(frame, { surfaceSeq: 1, viewportGen: 2, controllerGen: 3 })).toBe(
      true
    );
    expect(isCurrentWebAppFrame(frame, { surfaceSeq: 1, viewportGen: 1, controllerGen: 3 })).toBe(
      false
    );
    expect(isCurrentWebAppFrame(frame, { surfaceSeq: 2, viewportGen: 2, controllerGen: 3 })).toBe(
      false
    );
  });
  test("encodes viewer input exactly as the shared vector", () => {
    const vector = vectors.vectors.find((entry) => entry.name === "input-mouse-down")!;
    expect(encodeWebAppMessage("input", vector.json!)).toEqual(
      new Uint8Array(bytes(vector.frameHex!))
    );
  });
  test("rejects forbidden directions, malformed JSON and forged attach", () => {
    for (const name of [
      "reject-input-from-gateway",
      "reject-attach-from-viewer",
      "reject-unknown-type"
    ]) {
      const vector = vectors.vectors.find((entry) => entry.name === name)!;
      const frame = vector.frameHex ?? vector.tcpHex!.slice(8);
      expect(() => parseWebAppFrame(bytes(frame))).toThrow();
    }
    expect(() => parseWebAppFrame(new Uint8Array([1, 255]).buffer)).toThrow();
  });
  test("maps fitted image coordinates to the remote CSS viewport", () => {
    expect(
      remoteCoordinates(
        110,
        70,
        { left: 10, top: 20, width: 200, height: 100 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 640, y: 360 });
    expect(
      remoteCoordinates(
        -1,
        999,
        { left: 0, top: 0, width: 200, height: 100 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 0, y: 719 });
  });
});
