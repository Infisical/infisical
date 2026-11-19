import {
  TWebInputEvent,
  TWebInputTarget,
  TWebScreenshotEvent,
  TWebSessionActionEvent,
  TWebSessionEvent
} from "@app/hooks/api/pam/types";

export enum WebLogFilter {
  All = "all",
  Pages = "pages",
  Requests = "requests",
  Clicks = "clicks",
  Blocked = "blocked",
  Screenshots = "screenshots"
}

export const WEB_LOG_FILTER_LABELS: Record<WebLogFilter, string> = {
  [WebLogFilter.All]: "All activity",
  [WebLogFilter.Pages]: "Pages",
  [WebLogFilter.Requests]: "Requests",
  [WebLogFilter.Clicks]: "Clicks and input",
  [WebLogFilter.Blocked]: "Blocked",
  [WebLogFilter.Screenshots]: "Screenshots"
};

export type TWebLogKind = "page" | "request" | "input" | "session" | "blocked" | "screenshot";

export type TWebLogRow = {
  kind: TWebLogKind;
  title: string;
  detail?: string;
  meta: string[];
};

const STATIC_RESOURCE_TYPES = new Set([
  "stylesheet",
  "image",
  "media",
  "font",
  "script",
  "manifest",
  "texttrack"
]);

const BLOCKED_SESSION_ACTIONS = new Set([
  "navigation.blocked",
  "upload.blocked",
  "download.blocked"
]);

export const isBlockedWebEvent = (event: TWebSessionEvent): boolean =>
  (event.eventType === "http" && Boolean(event.blocked)) ||
  (event.eventType === "session" && BLOCKED_SESSION_ACTIONS.has(event.action));

export const isStaticAssetRequest = (event: TWebSessionEvent): boolean =>
  event.eventType === "http" &&
  !event.blocked &&
  STATIC_RESOURCE_TYPES.has(event.resourceType ?? "");

const matchesFilter = (
  event: TWebSessionEvent,
  filter: WebLogFilter,
  screenshot?: TWebScreenshotEvent
): boolean => {
  switch (filter) {
    case WebLogFilter.Pages:
      return (
        event.eventType === "navigation" ||
        (event.eventType === "http" && event.resourceType === "document")
      );
    case WebLogFilter.Requests:
      return event.eventType === "http";
    case WebLogFilter.Clicks:
      return event.eventType === "input";
    case WebLogFilter.Blocked:
      return isBlockedWebEvent(event);
    case WebLogFilter.Screenshots:
      return event.eventType === "screenshot" || Boolean(screenshot);
    default:
      return true;
  }
};

const quote = (value: string) => `"${value}"`;

export const describeTarget = (target?: TWebInputTarget): string | null => {
  if (!target) return null;
  const kind = target.role || target.tag;
  const label = target.name || target.text;
  if (kind && label) return `${kind} ${quote(label)}`;
  if (label) return quote(label);
  return kind ?? null;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const describeSessionAction = (event: TWebSessionActionEvent): TWebLogRow => {
  const row = (kind: TWebLogKind, title: string): TWebLogRow => ({
    kind,
    title,
    detail: event.detail,
    meta: []
  });
  switch (event.action) {
    case "start":
      return row("session", "Session started");
    case "end":
      return row("session", "Session ended");
    case "navigation.blocked":
      return row("blocked", "Blocked a page outside the allowed hosts");
    case "upload.blocked":
      return row("blocked", "Blocked a file upload");
    case "download.blocked":
      return row("blocked", "Blocked a download");
    case "popup":
      return row("page", "Opened a pop-up in the same tab");
    case "dialog":
      return {
        kind: "session",
        title: event.detail ? `Closed a ${event.detail} dialog` : "Closed a dialog",
        meta: []
      };
    case "recording.dropped":
      return row("session", "Some activity wasn't recorded");
    case "screenshot.skipped":
      return row("session", "Skipped a screenshot");
    case "screenshots.capped":
      return row("session", "Stopped taking screenshots for this session");
    default:
      return row("session", event.action);
  }
};

const describeInput = (event: TWebInputEvent): TWebLogRow => {
  const target = describeTarget(event.target);
  const on = target ? ` ${target}` : "";
  switch (event.action) {
    case "click":
      return { kind: "input", title: `Clicked${on || " the page"}`, meta: [] };
    case "submit":
      return { kind: "input", title: `Pressed Enter in${on || " a field"}`, meta: [] };
    case "paste": {
      const count = event.length ?? 0;
      return {
        kind: "input",
        title: `Pasted ${count} ${count === 1 ? "character" : "characters"}${target ? ` into ${target}` : ""}`,
        meta: []
      };
    }
    case "scroll":
      return {
        kind: "input",
        title: `Scrolled to ${event.scrollX ?? 0}, ${event.scrollY ?? 0}`,
        meta: []
      };
    case "navigate":
      return { kind: "input", title: "Entered an address in the address bar", meta: [] };
    case "back":
      return { kind: "input", title: "Went back", meta: [] };
    case "forward":
      return { kind: "input", title: "Went forward", meta: [] };
    case "reload":
      return { kind: "input", title: "Reloaded the page", meta: [] };
    default:
      return { kind: "input", title: String(event.action), meta: [] };
  }
};

const SCREENSHOT_TRIGGER_LABELS: Record<string, string> = {
  click: "a click",
  submit: "pressing Enter",
  navigate: "entering an address",
  back: "going back",
  forward: "going forward",
  reload: "reloading",
  scroll: "scrolling",
  navigation: "a page load"
};

export const describeWebEvent = (event: TWebSessionEvent): TWebLogRow | null => {
  switch (event.eventType) {
    case "http": {
      const meta = [
        event.status ? String(event.status) : "No response",
        ...(event.resourceType ? [event.resourceType] : []),
        ...(event.respBytes ? [formatBytes(event.respBytes)] : []),
        ...(event.durationMs !== undefined ? [`${event.durationMs} ms`] : [])
      ];
      return {
        kind: event.blocked ? "blocked" : "request",
        title: `${event.method} ${event.url}`,
        detail: event.blocked ? "Blocked: outside the allowed hosts" : event.error,
        meta
      };
    }
    case "navigation":
      return { kind: "page", title: `Opened ${event.url}`, meta: [] };
    case "session":
      return describeSessionAction(event);
    case "input":
      return describeInput(event);
    case "screenshot":
      return {
        kind: "screenshot",
        title: `Screenshot after ${SCREENSHOT_TRIGGER_LABELS[event.trigger] ?? event.trigger}`,
        meta: [`${event.width} × ${event.height}`, formatBytes(event.bytes)]
      };
    default:
      return null;
  }
};

export type TWebLogEntry = {
  event: TWebSessionEvent;
  row: TWebLogRow;
  screenshot?: TWebScreenshotEvent;
};

const screenshotOwnerKey = (event: TWebSessionEvent): string | null => {
  if (event.eventType === "input") return `input:${event.action}`;
  if (event.eventType === "navigation") return "navigation";
  return null;
};

// The gateway captures a screenshot once the page settles, so other events can land between it and
// the event that caused it. It is logged after that event, which is the latest one its trigger names.
const attachScreenshots = (events: TWebSessionEvent[]) => {
  const attached = new Map<TWebSessionEvent, TWebScreenshotEvent>();
  const owned = new Set<TWebScreenshotEvent>();
  const latestOwner = new Map<string, TWebSessionEvent>();
  events.forEach((event) => {
    if (event.eventType === "screenshot") {
      const key = event.trigger === "navigation" ? "navigation" : `input:${event.trigger}`;
      const owner = latestOwner.get(key);
      if (owner && !attached.has(owner)) {
        attached.set(owner, event);
        owned.add(event);
      }
      return;
    }
    const key = screenshotOwnerKey(event);
    if (key) latestOwner.set(key, event);
  });
  return { attached, owned };
};

export const buildWebLogEntries = (
  events: TWebSessionEvent[],
  options: { filter: WebLogFilter; search: string; showStaticAssets: boolean }
): TWebLogEntry[] => {
  const term = options.search.trim().toLowerCase();
  const { attached, owned } = attachScreenshots(events);
  return events.flatMap((event) => {
    if (event.eventType === "screenshot" && owned.has(event)) return [];
    const screenshot = attached.get(event);
    if (!matchesFilter(event, options.filter, screenshot)) return [];
    if (!options.showStaticAssets && isStaticAssetRequest(event)) return [];
    const row = describeWebEvent(event);
    if (!row) return [];
    if (term) {
      const haystack = [row.title, row.detail ?? "", ...row.meta].join("\n").toLowerCase();
      if (!haystack.includes(term)) return [];
    }
    return [{ event, row, ...(screenshot ? { screenshot } : {}) }];
  });
};
