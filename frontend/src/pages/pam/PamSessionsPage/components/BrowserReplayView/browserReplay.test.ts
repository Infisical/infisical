import { describe, expect, it } from "vitest";

import { TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";

import {
  buildBrowserReplay,
  buildBrowserTimeline,
  filterBrowserTimeline,
  frameAt,
  groupBrowserInputs,
  parseBrowserLogEntry,
  skipIdleStretch
} from "./browserReplay";

const toBase64 = (text: string) => {
  let binary = "";
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const browserEvent = (envelope: Record<string, unknown>, channelType = "browser") => ({
  timestamp: "2026-10-16T10:00:00.000Z",
  eventType: "browser",
  channelType,
  data: toBase64(JSON.stringify(envelope)),
  elapsedTime: Number(envelope.elapsedMs ?? 0) / 1000
});

const rawEvent = (data: string) => ({
  timestamp: "2026-10-16T10:00:00.000Z",
  eventType: "browser",
  channelType: "browser",
  data,
  elapsedTime: 0
});

const frame = (seq: number, elapsedMs: number) =>
  browserEvent({ type: "frame", elapsedMs, seq, width: 1280, height: 800, jpeg: `jpeg-${seq}` });

const request = (id: string, elapsedMs: number, method = "GET", url = "https://app.test/api") =>
  browserEvent({
    type: "http_request",
    elapsedMs,
    id,
    method,
    url,
    headers: { accept: "application/json" },
    resourceType: "XHR",
    bodySize: 0
  });

const response = (id: string, elapsedMs: number, status = 200) =>
  browserEvent({
    type: "http_response",
    elapsedMs,
    id,
    status,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    mimeType: "application/json",
    bodySize: 12,
    body: '{"ok":true}',
    fromCache: false
  });

const brokenChunk = (chunkIndex: number): TBrokenChunkMarker => ({
  __brokenChunk: true,
  chunkIndex,
  reason: "gcm",
  message: `Chunk ${chunkIndex} could not be decrypted`
});

describe("parseBrowserLogEntry", () => {
  it("ignores events from other channels", () => {
    const envelope = { type: "navigation", elapsedMs: 10, url: "https://app.test/" };
    expect(parseBrowserLogEntry(browserEvent(envelope, "rdp"))).toBeNull();
    expect(parseBrowserLogEntry(browserEvent(envelope, "terminal"))).toBeNull();
    expect(parseBrowserLogEntry({ ...browserEvent(envelope), channelType: undefined })).toBeNull();
    expect(parseBrowserLogEntry(brokenChunk(0))).toBeNull();
    expect(parseBrowserLogEntry(browserEvent(envelope))).toMatchObject({
      type: "navigation",
      url: "https://app.test/"
    });
  });

  it("returns null for data that is not a valid envelope", () => {
    expect(parseBrowserLogEntry(rawEvent("not base64 at all!"))).toBeNull();
    expect(parseBrowserLogEntry(rawEvent(toBase64("{not json")))).toBeNull();
    expect(parseBrowserLogEntry(rawEvent(toBase64("[1, 2]")))).toBeNull();
    expect(parseBrowserLogEntry(rawEvent(toBase64('{"elapsedMs": 5}')))).toBeNull();
    expect(parseBrowserLogEntry(browserEvent({ type: "telemetry", elapsedMs: 5 }))).toBeNull();
    expect(parseBrowserLogEntry(browserEvent({ type: "navigation", url: "https://a" }))).toBeNull();
    expect(parseBrowserLogEntry(browserEvent({ type: "frame", elapsedMs: 5, seq: 1 }))).toBeNull();
    expect(
      parseBrowserLogEntry(browserEvent({ type: "input", elapsedMs: 5, kind: "hover" }))
    ).toBeNull();
    expect(parseBrowserLogEntry({ ...rawEvent(""), data: 42 })).toBeNull();
    expect(parseBrowserLogEntry(null)).toBeNull();
  });

  it("decodes UTF-8 text in the envelope", () => {
    const parsed = parseBrowserLogEntry(
      browserEvent({
        type: "navigation",
        elapsedMs: 1,
        url: "https://app.test/",
        title: "Résumé · 東京"
      })
    );
    expect(parsed).toMatchObject({ title: "Résumé · 東京" });
  });
});

describe("buildBrowserReplay", () => {
  it("skips non-browser and malformed events", () => {
    const model = buildBrowserReplay([
      {
        timestamp: "",
        eventType: "output",
        channelType: "terminal",
        data: toBase64("ls"),
        elapsedTime: 0
      },
      rawEvent("%%%"),
      browserEvent({ type: "navigation", elapsedMs: 100, url: "https://app.test/" }),
      browserEvent({ type: "navigation", elapsedMs: 200, url: "https://app.test/next" }, "rdp")
    ]);
    expect(model.navigations.map((navigation) => navigation.url)).toEqual(["https://app.test/"]);
    expect(model.activityMs).toEqual([100]);
    expect(model.totalMs).toBe(100);
  });

  it("pairs each response with its request by id", () => {
    const model = buildBrowserReplay([
      request("a", 100),
      request("b", 150, "POST"),
      response("a", 300, 200),
      response("b", 400, 500),
      response("unknown", 450)
    ]);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[0]).toMatchObject({ id: "a", method: "GET", response: { status: 200 } });
    expect(model.requests[1]).toMatchObject({ id: "b", method: "POST", response: { status: 500 } });
  });

  it("keeps a request that never got a response", () => {
    const model = buildBrowserReplay([request("a", 100), request("b", 120), response("a", 200)]);
    expect(model.requests[0].response?.status).toBe(200);
    expect(model.requests[1].response).toBeNull();
  });

  it("gives a reused request id's response to the latest request", () => {
    const model = buildBrowserReplay([
      request("r", 100, "GET", "https://app.test/old"),
      request("r", 110, "GET", "https://app.test/new"),
      response("r", 200)
    ]);
    expect(model.requests[0].response).toBeNull();
    expect(model.requests[1].response?.status).toBe(200);
  });

  it("spans a broken chunk between the events around it", () => {
    const model = buildBrowserReplay([frame(1, 1000), brokenChunk(1), frame(2, 9000)]);
    expect(model.gaps).toEqual([
      expect.objectContaining({ chunkIndex: 1, startMs: 1000, endMs: 9000 })
    ]);
  });
});

describe("frameAt", () => {
  const { frames } = buildBrowserReplay([frame(2, 2000), frame(1, 500), frame(3, 4000)]);

  it("sorts frames by time", () => {
    expect(frames.map((f) => f.seq)).toEqual([1, 2, 3]);
  });

  it("returns the latest frame at or before the time", () => {
    expect(frameAt(frames, 499)).toBeNull();
    expect(frameAt(frames, 500)?.seq).toBe(1);
    expect(frameAt(frames, 1999)?.seq).toBe(1);
    expect(frameAt(frames, 2000)?.seq).toBe(2);
    expect(frameAt(frames, 60_000)?.seq).toBe(3);
  });

  it("reads the JPEG back from the recorded event", () => {
    expect(frameAt(frames, 2500)?.readJpeg()).toBe("jpeg-2");
  });
});

describe("skipIdleStretch", () => {
  const activity = [0, 1000, 20_000, 21_000];

  it("jumps over a quiet stretch longer than the idle gap", () => {
    expect(skipIdleStretch(activity, 5000)).toBe(19_000);
  });

  it("plays short gaps and the moments right after activity normally", () => {
    expect(skipIdleStretch(activity, 500)).toBe(500);
    expect(skipIdleStretch(activity, 1800)).toBe(1800);
    expect(skipIdleStretch(activity, 20_500)).toBe(20_500);
  });
});

describe("browser timeline", () => {
  it("merges a burst of key presses into one row", () => {
    const groups = groupBrowserInputs([
      { elapsedMs: 100, kind: "click", target: 'textbox "Title"' },
      { elapsedMs: 200, kind: "key", target: 'textbox "Title"', text: "h" },
      { elapsedMs: 300, kind: "key", target: 'textbox "Title"', text: "i" },
      { elapsedMs: 400, kind: "key", target: 'textbox "Title"' },
      { elapsedMs: 9000, kind: "key", target: 'textbox "Title"', text: "!" }
    ]);
    expect(groups.map((group) => [group.kind, group.text, group.count])).toEqual([
      ["click", undefined, 1],
      ["key", "hi", 3],
      ["key", "!", 1]
    ]);
    expect(groups[1].textlessCount).toBe(1);
  });

  it("filters writes, errors and blocked requests", () => {
    const rows = buildBrowserTimeline(
      buildBrowserReplay([
        browserEvent({ type: "input", elapsedMs: 50, kind: "click", target: 'button "Save"' }),
        request("get", 100),
        request("post", 200, "POST", "https://app.test/api/dashboards/db"),
        response("get", 150, 200),
        response("post", 300, 500),
        request("pending", 400),
        browserEvent({
          type: "blocked_request",
          elapsedMs: 500,
          method: "GET",
          url: "https://evil.test/"
        })
      ])
    );
    const kindsFor = (filter: "all" | "writes" | "errors" | "blocked", isStreaming = false) =>
      filterBrowserTimeline(rows, { filter, search: "", isStreaming }).map((row) => row.kind);

    expect(kindsFor("all")).toEqual(["input", "request", "request", "request", "blocked"]);
    expect(kindsFor("writes")).toEqual(["request"]);
    expect(kindsFor("errors")).toEqual(["request", "request"]);
    expect(kindsFor("errors", true)).toEqual(["request"]);
    expect(kindsFor("blocked")).toEqual(["blocked"]);
    expect(
      filterBrowserTimeline(rows, { filter: "all", search: "dashboards", isStreaming: false })
    ).toHaveLength(1);
  });
});
