import type { Socket } from "node:net";

import type WebSocket from "ws";

import {
  decodeWebFrame,
  encodeWebControl,
  lengthPrefixWebFrame,
  TWebAttach,
  WebAttachSchema,
  WebFrameDecoder,
  WebFrameRateLimiter,
  WebFrameType
} from "./pam-web-app-protocol";

const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_FRAMES = 6;
const MAX_CONTROLS = 256;
const DRAIN_TIMEOUT_MS = 30_000;

export const bridgeWebAppSession = ({
  socket,
  stream,
  attach,
  onAttached,
  onProtocolViolation
}: {
  socket: WebSocket;
  stream: Socket;
  attach: TWebAttach;
  onAttached: (data: Record<string, unknown>) => void;
  onProtocolViolation: () => void;
}) => {
  const decoder = new WebFrameDecoder();
  const inputRate = new WebFrameRateLimiter(240, 600);
  const controlRate = new WebFrameRateLimiter(30, 30);
  const queue: { frame: Buffer; type: WebFrameType }[] = [];
  const removers: (() => void)[] = [];
  let closed = false;
  let sending = false;
  let inFlightBytes = 0;
  let frameBytes = 0;
  let frames = 0;
  let controls = 0;
  let droppedLiveFrames = 0;
  let drainTimeout: ReturnType<typeof setTimeout> | undefined;
  let tcpDrainTimeout: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(drainTimeout);
    clearTimeout(tcpDrainTimeout);
    queue.length = 0;
    removers.splice(0).forEach((remove) => remove());
    stream.destroy();
  };
  const close = (code: "protocol" | "slow-reader") => {
    if (closed) return;
    if (code === "protocol") onProtocolViolation();
    if (socket.readyState === socket.OPEN) {
      socket.send(
        encodeWebControl({
          t: "error",
          code,
          message:
            code === "protocol"
              ? "The browser connection sent an invalid message."
              : "The browser connection is too slow. Reconnect to continue."
        }),
        { binary: true }
      );
      socket.close(1008, code);
      const timer = setTimeout(() => socket.terminate(), 1000);
      timer.unref();
    }
    cleanup();
  };
  function onClose() {
    cleanup();
    if (socket.readyState === socket.OPEN) socket.close();
  }
  const pump = () => {
    if (closed || sending || queue.length === 0 || socket.readyState !== socket.OPEN) return;
    const next = queue.shift()!;
    if (next.type === WebFrameType.Frame) {
      frames -= 1;
      frameBytes -= next.frame.length;
    } else controls -= 1;
    sending = true;
    inFlightBytes = next.frame.length;
    drainTimeout = setTimeout(() => close("slow-reader"), DRAIN_TIMEOUT_MS);
    socket.send(next.frame, { binary: true }, (error) => {
      clearTimeout(drainTimeout);
      sending = false;
      inFlightBytes = 0;
      if (error) {
        onClose();
        return;
      }
      pump();
    });
  };
  function onData(bytes: Buffer) {
    if (closed) return;
    try {
      decoder.push(bytes, (frame) => {
        if (closed) return;
        const { type, data } = decodeWebFrame(frame, "gateway");
        if (data?.t === "attached") onAttached(data);
        if (type === WebFrameType.Frame) {
          while (frames >= MAX_FRAMES || frameBytes + frame.length + inFlightBytes > MAX_FRAME_BYTES) {
            const index = queue.findIndex((entry) => entry.type === WebFrameType.Frame);
            if (index < 0) {
              droppedLiveFrames += 1;
              return;
            }
            frameBytes -= queue[index].frame.length;
            frames -= 1;
            queue.splice(index, 1);
            droppedLiveFrames += 1;
          }
          frames += 1;
          frameBytes += frame.length;
        } else {
          if (controls >= MAX_CONTROLS) {
            close("slow-reader");
            return;
          }
          controls += 1;
        }
        queue.push({ frame, type });
        pump();
      });
    } catch {
      close("protocol");
    }
  }
  function onDrain() {
    clearTimeout(tcpDrainTimeout);
    tcpDrainTimeout = undefined;
  }
  function onMessage(raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) {
    if (closed) return;
    try {
      if (!isBinary) {
        close("protocol");
        return;
      }
      let frame: Buffer;
      if (Buffer.isBuffer(raw)) frame = raw;
      else if (Array.isArray(raw)) frame = Buffer.concat(raw);
      else frame = Buffer.from(raw);
      const { type } = decodeWebFrame(frame, "viewer");
      if (!(type === WebFrameType.Input ? inputRate : controlRate).accept()) {
        close("protocol");
        return;
      }
      if (stream.writableLength + frame.length + 4 > MAX_FRAME_BYTES) {
        close("slow-reader");
        return;
      }
      if (!stream.write(lengthPrefixWebFrame(frame)) && !tcpDrainTimeout)
        tcpDrainTimeout = setTimeout(() => close("slow-reader"), DRAIN_TIMEOUT_MS);
    } catch {
      close("protocol");
    }
  }
  WebAttachSchema.parse(attach);
  stream.write(lengthPrefixWebFrame(encodeWebControl(attach)));
  stream.on("data", onData);
  stream.on("drain", onDrain);
  stream.on("close", onClose);
  stream.on("error", onClose);
  socket.on("message", onMessage);
  socket.on("close", onClose);
  socket.on("error", onClose);
  removers.push(
    () => socket.off("message", onMessage),
    () => socket.off("close", onClose),
    () => socket.off("error", onClose),
    () => stream.off("data", onData),
    () => stream.off("drain", onDrain),
    () => stream.off("close", onClose),
    () => stream.off("error", onClose)
  );
  return { cleanup, getDroppedLiveFrames: () => droppedLiveFrames };
};
