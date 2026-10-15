import { SessionChannelType } from "@app/hooks/api/pam/enums";
import { isBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";

const MASKED_TEXT = "•••";

const IDLE_GAP_MS = 5000;

// Skipping lands this far before the next change, so the change is seen happening
const IDLE_LEAD_MS = 1000;

const TYPING_BURST_GAP_MS = 2000;

const SCROLL_BURST_GAP_MS = 1000;

export type TBrowserHeaders = Record<string, string>;

export type TBrowserSessionStart = {
  elapsedMs: number;
  url: string;
  width: number;
  height: number;
  userAgent?: string;
};

export type TBrowserSessionEnd = {
  elapsedMs: number;
  reason: string;
};

export type TBrowserFrame = {
  seq: number;
  elapsedMs: number;
  width: number;
  height: number;
  // Reads the JPEG back out of the recorded event when it is drawn, so the model never holds a
  // second copy of every frame
  readJpeg: () => string | null;
};

export type TBrowserHttpResponse = {
  elapsedMs: number;
  status: number;
  statusText: string;
  headers: TBrowserHeaders;
  mimeType: string;
  bodySize: number;
  body?: string;
  fromCache: boolean;
};

export type TBrowserRequest = {
  id: string;
  elapsedMs: number;
  method: string;
  url: string;
  headers: TBrowserHeaders;
  resourceType: string;
  body?: string;
  bodySize: number;
  response: TBrowserHttpResponse | null;
};

export type TBrowserInputKind =
  | "click"
  | "double_click"
  | "right_click"
  | "key"
  | "text"
  | "scroll";

export type TBrowserInput = {
  elapsedMs: number;
  kind: TBrowserInputKind;
  x?: number;
  y?: number;
  target?: string;
  text?: string;
};

export type TBrowserNavigation = {
  elapsedMs: number;
  url: string;
  title?: string;
};

export type TBrowserBlockedRequest = {
  elapsedMs: number;
  method: string;
  url: string;
};

export type TBrowserDialog = {
  elapsedMs: number;
  kind: string;
  message: string;
  accepted: boolean;
};

export type TBrowserDownload = {
  elapsedMs: number;
  url: string;
  filename: string;
  allowed: boolean;
};

export type TBrowserRecordingGap = {
  chunkIndex: number;
  reason: string;
  message: string;
  startMs: number;
  endMs: number;
};

export type TBrowserEnvelope =
  | ({ type: "session_start" } & TBrowserSessionStart)
  | ({ type: "frame"; jpeg: string } & Omit<TBrowserFrame, "readJpeg">)
  | ({ type: "http_request" } & Omit<TBrowserRequest, "response">)
  | ({ type: "http_response"; id: string } & TBrowserHttpResponse)
  | ({ type: "input" } & TBrowserInput)
  | ({ type: "navigation" } & TBrowserNavigation)
  | ({ type: "blocked_request" } & TBrowserBlockedRequest)
  | ({ type: "dialog" } & TBrowserDialog)
  | ({ type: "download" } & TBrowserDownload)
  | ({ type: "session_end" } & TBrowserSessionEnd);

export type TBrowserReplayModel = {
  sessionStart: TBrowserSessionStart | null;
  sessionEnd: TBrowserSessionEnd | null;
  frames: TBrowserFrame[];
  requests: TBrowserRequest[];
  inputs: TBrowserInput[];
  navigations: TBrowserNavigation[];
  blockedRequests: TBrowserBlockedRequest[];
  dialogs: TBrowserDialog[];
  downloads: TBrowserDownload[];
  gaps: TBrowserRecordingGap[];
  // Every recorded moment in order, which idle skipping measures the quiet stretches between
  activityMs: number[];
  totalMs: number;
};

const INPUT_KINDS: TBrowserInputKind[] = [
  "click",
  "double_click",
  "right_click",
  "key",
  "text",
  "scroll"
];

const HIGH_BYTE_REGEX = /[\x80-\xff]/;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readHeaders = (value: unknown): TBrowserHeaders => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers: TBrowserHeaders = {};
  Object.entries(value as Record<string, unknown>).forEach(([name, headerValue]) => {
    if (typeof headerValue === "string") headers[name] = headerValue;
    else if (typeof headerValue === "number" || typeof headerValue === "boolean")
      headers[name] = String(headerValue);
  });
  return headers;
};

const decodeEnvelopeJson = (base64: string): unknown => {
  const binary = atob(base64);
  // atob yields one character per byte, which is only the right text when the payload is ASCII
  const text = HIGH_BYTE_REGEX.test(binary)
    ? new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
    : binary;
  return JSON.parse(text);
};

const parseEnvelope = (
  rec: Record<string, unknown>,
  elapsedMs: number
): TBrowserEnvelope | null => {
  switch (rec.type) {
    case "session_start": {
      const url = readString(rec.url);
      if (url === undefined) return null;
      return {
        type: "session_start",
        elapsedMs,
        url,
        width: readNumber(rec.width) ?? 0,
        height: readNumber(rec.height) ?? 0,
        userAgent: readString(rec.userAgent)
      };
    }
    case "frame": {
      const seq = readNumber(rec.seq);
      const jpeg = readString(rec.jpeg);
      if (seq === undefined || !jpeg) return null;
      return {
        type: "frame",
        elapsedMs,
        seq,
        width: readNumber(rec.width) ?? 0,
        height: readNumber(rec.height) ?? 0,
        jpeg
      };
    }
    case "http_request": {
      const id = readString(rec.id);
      const url = readString(rec.url);
      if (!id || url === undefined) return null;
      return {
        type: "http_request",
        elapsedMs,
        id,
        method: (readString(rec.method) ?? "GET").toUpperCase(),
        url,
        headers: readHeaders(rec.headers),
        resourceType: readString(rec.resourceType) ?? "Other",
        body: readString(rec.body),
        bodySize: readNumber(rec.bodySize) ?? 0
      };
    }
    case "http_response": {
      const id = readString(rec.id);
      const status = readNumber(rec.status);
      if (!id || status === undefined) return null;
      return {
        type: "http_response",
        elapsedMs,
        id,
        status,
        statusText: readString(rec.statusText) ?? "",
        headers: readHeaders(rec.headers),
        mimeType: readString(rec.mimeType) ?? "",
        bodySize: readNumber(rec.bodySize) ?? 0,
        body: readString(rec.body),
        fromCache: rec.fromCache === true
      };
    }
    case "input": {
      const kind = INPUT_KINDS.find((candidate) => candidate === rec.kind);
      if (!kind) return null;
      return {
        type: "input",
        elapsedMs,
        kind,
        x: readNumber(rec.x),
        y: readNumber(rec.y),
        target: readString(rec.target),
        text: readString(rec.text)
      };
    }
    case "navigation": {
      const url = readString(rec.url);
      if (url === undefined) return null;
      return { type: "navigation", elapsedMs, url, title: readString(rec.title) };
    }
    case "blocked_request": {
      const url = readString(rec.url);
      if (url === undefined) return null;
      return {
        type: "blocked_request",
        elapsedMs,
        method: (readString(rec.method) ?? "GET").toUpperCase(),
        url
      };
    }
    case "dialog":
      return {
        type: "dialog",
        elapsedMs,
        kind: readString(rec.kind) ?? "alert",
        message: readString(rec.message) ?? "",
        accepted: rec.accepted === true
      };
    case "download": {
      const url = readString(rec.url) ?? "";
      const filename = readString(rec.filename) ?? "";
      if (!url && !filename) return null;
      return { type: "download", elapsedMs, url, filename, allowed: rec.allowed === true };
    }
    case "session_end":
      return { type: "session_end", elapsedMs, reason: readString(rec.reason) ?? "" };
    default:
      return null;
  }
};

export const parseBrowserLogEntry = (entry: unknown): TBrowserEnvelope | null => {
  const e = entry as { data?: unknown; channelType?: unknown } | null;
  if (!e || e.channelType !== SessionChannelType.Browser || typeof e.data !== "string") return null;
  let raw: unknown;
  try {
    raw = decodeEnvelopeJson(e.data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const elapsedMs = readNumber(rec.elapsedMs);
  if (elapsedMs === undefined || elapsedMs < 0) return null;
  return parseEnvelope(rec, elapsedMs);
};

type TParsedEntry =
  | Exclude<TBrowserEnvelope, { type: "frame" }>
  | ({ type: "frame" } & TBrowserFrame);

// Keyed by the event object, so a recording that grows chunk by chunk is only parsed once
const parsedEntryCache = new WeakMap<object, TParsedEntry | null>();

const toParsedEntry = (event: unknown): TParsedEntry | null => {
  const isCacheable = typeof event === "object" && event !== null;
  if (isCacheable && parsedEntryCache.has(event)) return parsedEntryCache.get(event) ?? null;

  const envelope = parseBrowserLogEntry(event);
  let entry: TParsedEntry | null;
  if (!envelope) {
    entry = null;
  } else if (envelope.type === "frame") {
    const { jpeg, ...frame } = envelope;
    entry = {
      ...frame,
      readJpeg: () => {
        const reparsed = parseBrowserLogEntry(event);
        return reparsed?.type === "frame" ? reparsed.jpeg : null;
      }
    };
  } else {
    entry = envelope;
  }

  if (isCacheable) parsedEntryCache.set(event, entry);
  return entry;
};

export const buildBrowserReplay = (events: readonly unknown[]): TBrowserReplayModel => {
  const entries: TParsedEntry[] = [];
  const gaps: TBrowserRecordingGap[] = [];
  let openGapIndexes: number[] = [];
  let latestMs = 0;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (isBrokenChunkMarker(event)) {
      openGapIndexes.push(gaps.length);
      gaps.push({
        chunkIndex: event.chunkIndex,
        reason: event.reason,
        message: event.message,
        startMs: latestMs,
        endMs: latestMs
      });
    } else {
      const entry = toParsedEntry(event);
      if (entry) {
        entries.push(entry);
        // Chunks are consecutive stretches of the recording, so a broken one covers the time
        // between the events on either side of it
        openGapIndexes.forEach((gapIndex) => {
          gaps[gapIndex] = {
            ...gaps[gapIndex],
            endMs: Math.max(gaps[gapIndex].startMs, entry.elapsedMs)
          };
        });
        openGapIndexes = [];
        latestMs = Math.max(latestMs, entry.elapsedMs);
      }
    }
  }

  entries.sort((a, b) => a.elapsedMs - b.elapsedMs);

  const model: TBrowserReplayModel = {
    sessionStart: null,
    sessionEnd: null,
    frames: [],
    requests: [],
    inputs: [],
    navigations: [],
    blockedRequests: [],
    dialogs: [],
    downloads: [],
    gaps,
    activityMs: entries.map((entry) => entry.elapsedMs),
    totalMs: 0
  };

  // CDP reuses a request id across a redirect chain, so a response belongs to the latest
  // unanswered request with its id
  const unanswered = new Map<string, TBrowserRequest[]>();

  entries.forEach((entry) => {
    switch (entry.type) {
      case "session_start": {
        const { type, ...start } = entry;
        if (!model.sessionStart) model.sessionStart = start;
        break;
      }
      case "session_end": {
        const { type, ...end } = entry;
        model.sessionEnd = end;
        break;
      }
      case "frame": {
        const { type, ...frame } = entry;
        model.frames.push(frame);
        break;
      }
      case "http_request": {
        const { type, ...request } = entry;
        const row: TBrowserRequest = { ...request, response: null };
        model.requests.push(row);
        unanswered.set(row.id, [...(unanswered.get(row.id) ?? []), row]);
        break;
      }
      case "http_response": {
        const { type, id, ...response } = entry;
        const request = unanswered.get(id)?.pop();
        if (request) request.response = response;
        break;
      }
      case "input": {
        const { type, ...input } = entry;
        model.inputs.push(input);
        break;
      }
      case "navigation": {
        const { type, ...navigation } = entry;
        model.navigations.push(navigation);
        break;
      }
      case "blocked_request": {
        const { type, ...blocked } = entry;
        model.blockedRequests.push(blocked);
        break;
      }
      case "dialog": {
        const { type, ...dialog } = entry;
        model.dialogs.push(dialog);
        break;
      }
      case "download": {
        const { type, ...download } = entry;
        model.downloads.push(download);
        break;
      }
      default:
        break;
    }
  });

  const lastEntryMs = entries.length ? entries[entries.length - 1].elapsedMs : 0;
  const lastGapMs = gaps.reduce((max, gap) => Math.max(max, gap.endMs), 0);
  model.totalMs = Math.max(lastEntryMs, model.sessionEnd?.elapsedMs ?? 0, lastGapMs);

  return model;
};

const searchLastAtOrBefore = (count: number, timeAt: (index: number) => number, ms: number) => {
  let low = 0;
  let high = count - 1;
  let found = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (timeAt(mid) <= ms) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
};

export const indexAtOrBefore = <T extends { elapsedMs: number }>(items: readonly T[], ms: number) =>
  searchLastAtOrBefore(items.length, (index) => items[index].elapsedMs, ms);

export const frameAt = (frames: readonly TBrowserFrame[], ms: number): TBrowserFrame | null => {
  const index = indexAtOrBefore(frames, ms);
  return index >= 0 ? frames[index] : null;
};

export const frameKey = (frame: TBrowserFrame) => `${frame.seq}:${frame.elapsedMs}`;

export const urlAt = (model: TBrowserReplayModel, ms: number): TBrowserNavigation | null => {
  const index = indexAtOrBefore(model.navigations, ms);
  if (index >= 0) return model.navigations[index];
  if (!model.sessionStart) return null;
  return { elapsedMs: model.sessionStart.elapsedMs, url: model.sessionStart.url };
};

export const skipIdleStretch = (activityMs: readonly number[], ms: number): number => {
  const previousIndex = searchLastAtOrBefore(activityMs.length, (index) => activityMs[index], ms);
  const next = activityMs[previousIndex + 1];
  if (next === undefined) return ms;
  const previous = previousIndex >= 0 ? activityMs[previousIndex] : 0;
  if (next - previous <= IDLE_GAP_MS) return ms;
  const resumeAt = next - IDLE_LEAD_MS;
  return ms > previous + IDLE_LEAD_MS && ms < resumeAt ? resumeAt : ms;
};

export type TBrowserInputGroup = TBrowserInput & {
  endMs: number;
  count: number;
  // Keys without text (Backspace, arrows) leave the typed text incomplete
  textlessCount: number;
};

export type TBrowserTimelineRow = { key: string; elapsedMs: number } & (
  | { kind: "session_start"; start: TBrowserSessionStart }
  | { kind: "session_end"; end: TBrowserSessionEnd }
  | { kind: "input"; input: TBrowserInputGroup }
  | { kind: "navigation"; navigation: TBrowserNavigation }
  | { kind: "request"; request: TBrowserRequest }
  | { kind: "blocked"; blocked: TBrowserBlockedRequest }
  | { kind: "dialog"; dialog: TBrowserDialog }
  | { kind: "download"; download: TBrowserDownload }
  | { kind: "gap"; gap: TBrowserRecordingGap }
);

export type TBrowserTimelineRowKind = TBrowserTimelineRow["kind"];

// Orders rows that share a millisecond so the cause reads before its effect
const ROW_KIND_ORDER: Record<TBrowserTimelineRowKind, number> = {
  session_start: 0,
  input: 1,
  navigation: 2,
  request: 3,
  blocked: 4,
  dialog: 5,
  download: 6,
  gap: 7,
  session_end: 8
};

const joinTypedText = (current?: string, next?: string): string | undefined => {
  if (current === MASKED_TEXT && next === MASKED_TEXT) return MASKED_TEXT;
  if (current === undefined) return next;
  return next === undefined ? current : `${current}${next}`;
};

export const groupBrowserInputs = (inputs: readonly TBrowserInput[]): TBrowserInputGroup[] => {
  const groups: TBrowserInputGroup[] = [];
  inputs.forEach((input) => {
    const last = groups[groups.length - 1];
    const textless = input.kind === "key" && !input.text ? 1 : 0;
    const burstGapMs = input.kind === "key" ? TYPING_BURST_GAP_MS : SCROLL_BURST_GAP_MS;
    const continuesBurst =
      last !== undefined &&
      (input.kind === "key" || input.kind === "scroll") &&
      last.kind === input.kind &&
      last.target === input.target &&
      input.elapsedMs - last.endMs <= burstGapMs;

    if (continuesBurst) {
      groups[groups.length - 1] = {
        ...last,
        endMs: input.elapsedMs,
        count: last.count + 1,
        text: joinTypedText(last.text, input.text),
        textlessCount: last.textlessCount + textless
      };
      return;
    }

    groups.push({ ...input, endMs: input.elapsedMs, count: 1, textlessCount: textless });
  });
  return groups;
};

export const buildBrowserTimeline = (model: TBrowserReplayModel): TBrowserTimelineRow[] => {
  const rows: TBrowserTimelineRow[] = [];
  if (model.sessionStart) {
    rows.push({
      key: "session-start",
      kind: "session_start",
      elapsedMs: model.sessionStart.elapsedMs,
      start: model.sessionStart
    });
  }
  groupBrowserInputs(model.inputs).forEach((input, index) => {
    rows.push({
      key: `input-${input.elapsedMs}-${index}`,
      kind: "input",
      elapsedMs: input.elapsedMs,
      input
    });
  });
  model.navigations.forEach((navigation, index) => {
    rows.push({
      key: `navigation-${navigation.elapsedMs}-${index}`,
      kind: "navigation",
      elapsedMs: navigation.elapsedMs,
      navigation
    });
  });
  model.requests.forEach((request, index) => {
    rows.push({
      key: `request-${request.id}-${request.elapsedMs}-${index}`,
      kind: "request",
      elapsedMs: request.elapsedMs,
      request
    });
  });
  model.blockedRequests.forEach((blocked, index) => {
    rows.push({
      key: `blocked-${blocked.elapsedMs}-${index}`,
      kind: "blocked",
      elapsedMs: blocked.elapsedMs,
      blocked
    });
  });
  model.dialogs.forEach((dialog, index) => {
    rows.push({
      key: `dialog-${dialog.elapsedMs}-${index}`,
      kind: "dialog",
      elapsedMs: dialog.elapsedMs,
      dialog
    });
  });
  model.downloads.forEach((download, index) => {
    rows.push({
      key: `download-${download.elapsedMs}-${index}`,
      kind: "download",
      elapsedMs: download.elapsedMs,
      download
    });
  });
  model.gaps.forEach((gap, index) => {
    rows.push({ key: `gap-${gap.chunkIndex}-${index}`, kind: "gap", elapsedMs: gap.startMs, gap });
  });
  if (model.sessionEnd) {
    rows.push({
      key: "session-end",
      kind: "session_end",
      elapsedMs: model.sessionEnd.elapsedMs,
      end: model.sessionEnd
    });
  }

  return rows.sort(
    (a, b) => a.elapsedMs - b.elapsedMs || ROW_KIND_ORDER[a.kind] - ROW_KIND_ORDER[b.kind]
  );
};

export type TBrowserTimelineFilter = "all" | "writes" | "errors" | "blocked";

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export const isWriteMethod = (method: string) => WRITE_METHODS.includes(method.toUpperCase());

// A request still waiting on its response in a live session may yet get one, and a WebSocket
// upgrade is answered outside the HTTP response events
export const isFailedRequest = (request: TBrowserRequest, isStreaming: boolean) => {
  if (!request.response) return !isStreaming && request.resourceType !== "WebSocket";
  return request.response.status >= 400 || request.response.status === 0;
};

export const matchesTimelineFilter = (
  row: TBrowserTimelineRow,
  filter: TBrowserTimelineFilter,
  isStreaming: boolean
) => {
  switch (filter) {
    case "writes":
      return (
        (row.kind === "request" && isWriteMethod(row.request.method)) ||
        (row.kind === "blocked" && isWriteMethod(row.blocked.method))
      );
    case "errors":
      return row.kind === "request" && isFailedRequest(row.request, isStreaming);
    case "blocked":
      return row.kind === "blocked";
    default:
      return true;
  }
};

export const timelineRowUrl = (row: TBrowserTimelineRow): string | null => {
  switch (row.kind) {
    case "request":
      return row.request.url;
    case "blocked":
      return row.blocked.url;
    case "navigation":
      return row.navigation.url;
    case "download":
      return row.download.url;
    case "session_start":
      return row.start.url;
    default:
      return null;
  }
};

export const filterBrowserTimeline = (
  rows: readonly TBrowserTimelineRow[],
  {
    filter,
    search,
    isStreaming
  }: { filter: TBrowserTimelineFilter; search: string; isStreaming: boolean }
) => {
  const term = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchesTimelineFilter(row, filter, isStreaming)) return false;
    if (!term) return true;
    return timelineRowUrl(row)?.toLowerCase().includes(term) ?? false;
  });
};

export const formatPlaybackTime = (ms: number) => {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const HOSTED_PROTOCOLS = ["http:", "https:", "ws:", "wss:"];

export const splitUrl = (url: string): { host: string; path: string } => {
  try {
    const parsed = new URL(url);
    if (!HOSTED_PROTOCOLS.includes(parsed.protocol)) return { host: "", path: url };
    return { host: parsed.host, path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  } catch {
    return { host: "", path: url };
  }
};
