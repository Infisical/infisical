import { describe, expect, test } from "vitest";

import { SessionChannelType } from "@app/hooks/api/pam/enums";
import { isWebSessionEvent, TWebSessionEvent } from "@app/hooks/api/pam/types";

import {
  buildWebLogEntries,
  describeTarget,
  describeWebEvent,
  WebLogFilter
} from "./webSessionLog";

const base = {
  timestamp: "2026-11-19T12:00:00Z",
  channelType: SessionChannelType.Web as const,
  elapsedTime: 1
};

const http = (overrides: Partial<Extract<TWebSessionEvent, { eventType: "http" }>> = {}) =>
  ({
    ...base,
    eventType: "http",
    method: "GET",
    url: "https://grafana.internal/api/dashboards",
    status: 200,
    resourceType: "xhr",
    respBytes: 2048,
    durationMs: 12,
    ...overrides
  }) as TWebSessionEvent;

const events: TWebSessionEvent[] = [
  { ...base, eventType: "session", action: "start", detail: "https://grafana.internal/" },
  { ...base, eventType: "navigation", url: "https://grafana.internal/" },
  http({ resourceType: "document", url: "https://grafana.internal/" }),
  http({ resourceType: "script", url: "https://grafana.internal/app.js" }),
  http({ resourceType: "image", url: "https://evil.example/x.png", blocked: true, status: 0 }),
  http(),
  {
    ...base,
    eventType: "input",
    action: "click",
    x: 10,
    y: 20,
    target: { tag: "button", role: "button", name: "Save dashboard" }
  },
  { ...base, eventType: "session", action: "navigation.blocked", detail: "https://evil.example/" },
  {
    ...base,
    eventType: "screenshot",
    trigger: "click",
    width: 1280,
    height: 800,
    bytes: 3,
    format: "webp",
    image: "AAA"
  }
];

const titles = (filter: WebLogFilter, showStaticAssets = false, search = "") =>
  buildWebLogEntries(events, { filter, search, showStaticAssets }).map((e) => e.row.title);

describe("buildWebLogEntries", () => {
  test("all activity hides static assets by default but keeps blocked ones", () => {
    expect(titles(WebLogFilter.All)).toEqual([
      "Session started",
      "Opened https://grafana.internal/",
      "GET https://grafana.internal/",
      "GET https://evil.example/x.png",
      "GET https://grafana.internal/api/dashboards",
      'Clicked button "Save dashboard"',
      "Blocked a page outside the allowed hosts"
    ]);
  });

  test("static assets show when asked for", () => {
    expect(titles(WebLogFilter.Requests, true)).toContain("GET https://grafana.internal/app.js");
    expect(titles(WebLogFilter.Requests, false)).not.toContain(
      "GET https://grafana.internal/app.js"
    );
  });

  test("pages are navigations and document requests", () => {
    expect(titles(WebLogFilter.Pages)).toEqual([
      "Opened https://grafana.internal/",
      "GET https://grafana.internal/"
    ]);
  });

  test("clicks are input events", () => {
    expect(titles(WebLogFilter.Clicks)).toEqual(['Clicked button "Save dashboard"']);
  });

  test("blocked covers refused requests and refused pages", () => {
    expect(titles(WebLogFilter.Blocked)).toEqual([
      "GET https://evil.example/x.png",
      "Blocked a page outside the allowed hosts"
    ]);
  });

  test("search matches titles, details and metadata, ignoring case", () => {
    expect(titles(WebLogFilter.All, false, "SAVE")).toEqual(['Clicked button "Save dashboard"']);
    expect(titles(WebLogFilter.All, false, "evil.example")).toHaveLength(2);
    expect(titles(WebLogFilter.All, false, "2.0 kb")).toHaveLength(3);
  });
});

describe("describeWebEvent", () => {
  test("a request with no response says so", () => {
    expect(describeWebEvent(http({ status: 0, error: "net::ERR_FAILED" }))).toMatchObject({
      kind: "request",
      detail: "net::ERR_FAILED",
      meta: ["No response", "xhr", "2.0 KB", "12 ms"]
    });
  });

  test("a paste reports only its length", () => {
    expect(
      describeWebEvent({ ...base, eventType: "input", action: "paste", length: 1 })?.title
    ).toBe("Pasted 1 character");
    expect(
      describeWebEvent({
        ...base,
        eventType: "input",
        action: "paste",
        length: 42,
        target: { tag: "input", role: "textbox", name: "Search" }
      })?.title
    ).toBe('Pasted 42 characters into textbox "Search"');
  });

  test("a dialog names its type, never its message", () => {
    expect(
      describeWebEvent({ ...base, eventType: "session", action: "dialog", detail: "confirm" })
    ).toEqual({ kind: "session", title: "Closed a confirm dialog", meta: [] });
  });
});

describe("describeTarget", () => {
  test("prefers the role and accessible name, then falls back", () => {
    expect(describeTarget({ tag: "a", role: "link", name: "Home", text: "Home page" })).toBe(
      'link "Home"'
    );
    expect(describeTarget({ tag: "div", text: "Panel" })).toBe('div "Panel"');
    expect(describeTarget({ tag: "canvas" })).toBe("canvas");
    expect(describeTarget(undefined)).toBeNull();
  });
});

describe("isWebSessionEvent", () => {
  test("tells web events from terminal events that share an event type", () => {
    expect(isWebSessionEvent(events[6])).toBe(true);
    expect(
      isWebSessionEvent({
        timestamp: base.timestamp,
        eventType: "input",
        channelType: SessionChannelType.Terminal,
        data: "",
        elapsedTime: 0
      })
    ).toBe(false);
    expect(isWebSessionEvent(null)).toBe(false);
  });
});

describe("events as the gateway records them", () => {
  const recorded = [
    '{"timestamp":"2026-11-19T20:35:16.407568589-03:00","eventType":"session","channelType":"web","elapsedTime":0.057364733,"action":"start","detail":"http://127.0.0.1:38869/"}',
    '{"timestamp":"2026-11-19T20:35:16.428570177-03:00","eventType":"navigation","channelType":"web","elapsedTime":0.078366332,"url":"http://127.0.0.1:38869/"}',
    '{"timestamp":"2026-11-19T20:35:16.521966688-03:00","eventType":"http","channelType":"web","elapsedTime":0.171762838,"url":"http://127.0.0.1:38869/redirect","method":"GET","status":302,"mimeType":"text/html","resourceType":"document","respBytes":138,"durationMs":5}',
    '{"timestamp":"2026-11-19T20:35:16.617666673-03:00","eventType":"http","channelType":"web","elapsedTime":0.267462813,"url":"http://blocked.invalid/x?token=***","method":"GET","status":0,"mimeType":"","resourceType":"document","respBytes":0,"durationMs":1,"blocked":true,"error":"net::ERR_ABORTED"}',
    '{"timestamp":"2026-11-19T20:35:16.517565543-03:00","eventType":"input","channelType":"web","elapsedTime":0.16736169,"action":"click","x":50,"y":50,"target":{"tag":"a","role":"link","name":"next","text":"next"}}',
    '{"timestamp":"2026-11-19T20:35:16.61812959-03:00","eventType":"input","channelType":"web","elapsedTime":0.267925734,"action":"paste","length":11}',
    '{"timestamp":"2026-11-19T20:35:16.61755639-03:00","eventType":"session","channelType":"web","elapsedTime":0.267352524,"action":"navigation.blocked","detail":"http://blocked.invalid/x?token=***"}'
  ].map((line) => JSON.parse(line) as unknown);

  test("every recorded event is recognized and described", () => {
    expect(recorded.every(isWebSessionEvent)).toBe(true);
    const entries = buildWebLogEntries(recorded as TWebSessionEvent[], {
      filter: WebLogFilter.All,
      search: "",
      showStaticAssets: false
    });
    expect(entries.map((e) => e.row)).toEqual([
      { kind: "session", title: "Session started", detail: "http://127.0.0.1:38869/", meta: [] },
      { kind: "page", title: "Opened http://127.0.0.1:38869/", meta: [] },
      {
        kind: "request",
        title: "GET http://127.0.0.1:38869/redirect",
        detail: undefined,
        meta: ["302", "document", "138 B", "5 ms"]
      },
      {
        kind: "blocked",
        title: "GET http://blocked.invalid/x?token=***",
        detail: "Blocked: outside the allowed hosts",
        meta: ["No response", "document", "1 ms"]
      },
      { kind: "input", title: 'Clicked link "next"', meta: [] },
      { kind: "input", title: "Pasted 11 characters", meta: [] },
      {
        kind: "blocked",
        title: "Blocked a page outside the allowed hosts",
        detail: "http://blocked.invalid/x?token=***",
        meta: []
      }
    ]);
  });
});

describe("screenshots as the gateway records them", () => {
  test("a click screenshot attaches to its click and a scroll screenshot to its scroll", () => {
    const recorded = [
      '{"timestamp":"2026-11-19T20:50:39.900000000-03:00","eventType":"input","channelType":"web","elapsedTime":1.1,"action":"click","x":40,"y":40,"target":{"tag":"button","role":"button","name":"save"}}',
      '{"timestamp":"2026-11-19T20:50:40.351035708-03:00","eventType":"screenshot","channelType":"web","elapsedTime":1.597308739,"trigger":"click","width":1265,"height":800,"bytes":8134,"format":"webp","image":"UklGRiQAAABXRUJQ"}',
      '{"timestamp":"2026-11-19T20:50:41.440905804-03:00","eventType":"input","channelType":"web","elapsedTime":2.687178811,"action":"scroll","scrollX":0,"scrollY":800}',
      '{"timestamp":"2026-11-19T20:50:41.900000000-03:00","eventType":"screenshot","channelType":"web","elapsedTime":3.1,"trigger":"scroll","width":1265,"height":800,"bytes":7392,"format":"webp","image":"UklGRiQAAABXRUJQ"}',
      '{"timestamp":"2026-11-19T20:50:42.000000000-03:00","eventType":"session","channelType":"web","elapsedTime":3.2,"action":"screenshot.skipped","detail":"capturing the screenshot failed"}'
    ].map((line) => JSON.parse(line) as TWebSessionEvent);

    const entries = buildWebLogEntries(recorded, {
      filter: WebLogFilter.All,
      search: "",
      showStaticAssets: false
    });
    expect(entries.map((e) => [e.row.title, e.screenshot?.trigger, e.row.detail])).toEqual([
      ['Clicked button "save"', "click", undefined],
      ["Scrolled to 0, 800", "scroll", undefined],
      ["Skipped a screenshot", undefined, "capturing the screenshot failed"]
    ]);
  });
});

describe("screenshots", () => {
  const shot = (trigger: string, elapsedTime: number) =>
    ({
      ...base,
      elapsedTime,
      eventType: "screenshot",
      trigger,
      width: 1280,
      height: 800,
      bytes: 51200,
      format: "webp",
      image: "AAA"
    }) as TWebSessionEvent;
  const click = (name: string) =>
    ({
      ...base,
      eventType: "input",
      action: "click",
      target: { tag: "button", role: "button", name }
    }) as TWebSessionEvent;

  const build = (list: TWebSessionEvent[], filter = WebLogFilter.All) =>
    buildWebLogEntries(list, { filter, search: "", showStaticAssets: false });

  test("a screenshot attaches to the latest event its trigger names, past events in between", () => {
    const entries = build([
      click("First"),
      click("Save dashboard"),
      http(),
      { ...base, eventType: "navigation", url: "https://grafana.internal/d/1" },
      shot("click", 3)
    ]);
    expect(entries.map((e) => [e.row.title, e.screenshot?.elapsedTime])).toEqual([
      ['Clicked button "First"', undefined],
      ['Clicked button "Save dashboard"', 3],
      ["GET https://grafana.internal/api/dashboards", undefined],
      ["Opened https://grafana.internal/d/1", undefined]
    ]);
  });

  test("page-load screenshots attach to the navigation", () => {
    const entries = build([
      { ...base, eventType: "navigation", url: "https://grafana.internal/" },
      shot("navigation", 2)
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].screenshot?.trigger).toBe("navigation");
  });

  test("a screenshot with no event to attach to gets its own row", () => {
    const entries = build([shot("reload", 1)]);
    expect(entries.map((e) => e.row)).toEqual([
      {
        kind: "screenshot",
        title: "Screenshot after reloading",
        meta: ["1280 × 800", "50.0 KB"]
      }
    ]);
  });

  test("an event keeps its first screenshot and a later one stands alone", () => {
    const entries = build([click("Save"), shot("click", 1), shot("click", 2)]);
    expect(entries.map((e) => e.row.kind)).toEqual(["input", "screenshot"]);
    expect(entries[0].screenshot?.elapsedTime).toBe(1);
  });

  test("the screenshots filter lists every captured moment", () => {
    const entries = build(
      [click("Save"), shot("click", 1), http(), shot("reload", 2)],
      WebLogFilter.Screenshots
    );
    expect(entries.map((e) => e.row.title)).toEqual([
      'Clicked button "Save"',
      "Screenshot after reloading"
    ]);
  });
});
