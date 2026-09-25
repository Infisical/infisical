import { EventEmitter } from "node:events";

import { FastifyReply } from "fastify";
import { describe, expect, test } from "vitest";

import { ClientClosedRequestError, throwIfClientDisconnected } from "@app/lib/errors";

import { getClientDisconnectSignal } from "./client-disconnect";

const makeReply = (state: { destroyed?: boolean; writableEnded?: boolean } = {}) => {
  const raw = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, ...state });
  return { reply: { raw } as unknown as FastifyReply, raw };
};

describe("getClientDisconnectSignal", () => {
  test("stays open while the request is in flight", () => {
    const { reply } = makeReply();
    expect(getClientDisconnectSignal(reply).aborted).toBe(false);
  });

  test("aborts when the connection closes before the response is written", () => {
    const { reply, raw } = makeReply();
    const signal = getClientDisconnectSignal(reply);
    raw.emit("close");
    expect(signal.aborted).toBe(true);
  });

  test("does not abort when close follows a completed response", () => {
    const { reply, raw } = makeReply();
    const signal = getClientDisconnectSignal(reply);
    raw.writableEnded = true;
    raw.emit("close");
    expect(signal.aborted).toBe(false);
  });

  test("is already aborted when the connection closed before the handler asked", () => {
    const { reply } = makeReply({ destroyed: true });
    expect(getClientDisconnectSignal(reply).aborted).toBe(true);
  });
});

describe("throwIfClientDisconnected", () => {
  test("does nothing without a signal or with an open one", () => {
    expect(() => throwIfClientDisconnected()).not.toThrow();
    expect(() => throwIfClientDisconnected(new AbortController().signal)).not.toThrow();
  });

  test("throws ClientClosedRequestError once aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfClientDisconnected(controller.signal)).toThrow(ClientClosedRequestError);
  });
});
