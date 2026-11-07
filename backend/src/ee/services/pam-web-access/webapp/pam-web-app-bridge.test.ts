import { EventEmitter } from "node:events";
import type { Socket } from "node:net";

import { vi } from "vitest";
import type WebSocket from "ws";

import { bridgeWebAppSession } from "./pam-web-app-bridge";
import { encodeWebControl, lengthPrefixWebFrame, WebAttachSchema } from "./pam-web-app-protocol";
import vectors from "./protocol-vectors-v2.json";

const createViewer = () => {
  const viewer = Object.assign(new EventEmitter(), {
    OPEN: 1,
    readyState: 1,
    sent: [] as Buffer[],
    callbacks: [] as (() => void)[],
    close: vi.fn<(...args: [number?, string?]) => void>(() => {
      viewer.readyState = 3;
    }),
    terminate: vi.fn(),
    send(frame: Buffer, _options: unknown, callback?: () => void) {
      viewer.sent.push(frame);
      if (callback) viewer.callbacks.push(callback);
    }
  });
  return viewer;
};
class Gateway extends EventEmitter {
  writableLength = 0;
  writes: Buffer[] = [];
  destroy = vi.fn();
  write(bytes: Buffer) {
    this.writes.push(bytes);
    return true;
  }
}
const attach = WebAttachSchema.parse(vectors.vectors.find((vector) => vector.name === "attach-control-tcp")!.json);
const setup = () => {
  const viewer = createViewer();
  const gateway = new Gateway();
  const violation = vi.fn();
  const bridge = bridgeWebAppSession({
    socket: viewer as unknown as WebSocket,
    stream: gateway as unknown as Socket,
    attach,
    onAttached: vi.fn(),
    onProtocolViolation: violation
  });
  return { viewer, gateway, violation, bridge };
};
describe("frame-aware PAM browser bridge", () => {
  test("injects attach before forwarding input and prefixes each message", () => {
    const { viewer, gateway, bridge } = setup();
    const input = Buffer.from(vectors.vectors.find((vector) => vector.name === "input-mouse-down")!.frameHex!, "hex");
    expect(gateway.writes[0].toString("hex")).toBe(
      vectors.vectors.find((vector) => vector.name === "attach-control-tcp")!.tcpHex
    );
    viewer.emit("message", input, true);
    expect(gateway.writes[1]).toEqual(lengthPrefixWebFrame(input));
    bridge.cleanup();
  });
  test("refuses participant attach, paste, and text WebSocket messages", () => {
    for (const [frame, binary] of [
      [encodeWebControl(attach), true],
      [encodeWebControl({ t: "paste", seq: 1, surfaceSeq: 1, text: "secret" }), true],
      [Buffer.from("text"), false]
    ] as const) {
      const { viewer, gateway, violation } = setup();
      viewer.emit("message", frame, binary);
      expect(violation).toHaveBeenCalledOnce();
      expect(gateway.writes).toHaveLength(1);
      expect(viewer.close).toHaveBeenCalledWith(1008, "protocol");
    }
  });
  test("splits gateway reads into individual WebSocket messages", () => {
    const { viewer, gateway, bridge } = setup();
    const vector = vectors.vectors.find((item) => item.name === "tcp-split-reassembly")!;
    for (const part of vector.tcpHexParts!) gateway.emit("data", Buffer.from(part, "hex"));
    expect(viewer.sent[0].toString("hex")).toBe(vector.expectFrames![0]);
    viewer.callbacks.shift()!();
    expect(viewer.sent[1].toString("hex")).toBe(vector.expectFrames![1]);
    bridge.cleanup();
  });
  test("drops old display frames while bounding slow readers", () => {
    vi.useFakeTimers();
    try {
      const { viewer, gateway, bridge } = setup();
      const frame = Buffer.from(vectors.vectors.find((item) => item.name === "frame-minimal-jpeg")!.tcpHex!, "hex");
      for (let n = 0; n < 20; n += 1) gateway.emit("data", frame);
      expect(bridge.getDroppedLiveFrames()).toBeGreaterThan(0);
      vi.advanceTimersByTime(30_000);
      expect(viewer.close).toHaveBeenCalledWith(1008, "slow-reader");
      bridge.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });
  test("closes when the bounded control queue fills", () => {
    const { viewer, gateway, bridge } = setup();
    for (let n = 0; n < 258; n += 1) gateway.emit("data", lengthPrefixWebFrame(encodeWebControl({ t: "pong" })));
    expect(viewer.close).toHaveBeenCalledWith(1008, "slow-reader");
    bridge.cleanup();
  });
});
