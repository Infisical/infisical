import { useEffect, useMemo, useState } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";

import { Card, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import { SessionChannelType, TSessionEvent } from "@app/hooks/api/pam";
import { TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback";

import { formatPlaybackTime } from "./browserReplay";
import { BrowserReplayView } from "./BrowserReplayView";

type TReplayEvent = TSessionEvent | TBrokenChunkMarker;

type TEnvelope = { type: string; elapsedMs: number } & Record<string, unknown>;

const APP_ORIGIN = "https://dash.internal.example.com";
const VIEWPORT = { width: 1280, height: 800 };
const SESSION_STARTED_AT = Date.parse("2026-10-16T09:30:00.000Z");

const COLORS = {
  page: "hsl(220 20% 97%)",
  topBar: "hsl(222 25% 16%)",
  search: "hsl(222 20% 26%)",
  nav: "hsl(220 18% 92%)",
  text: "hsl(222 25% 16%)",
  muted: "hsl(220 10% 46%)",
  panel: "hsl(0 0% 100%)",
  border: "hsl(220 14% 84%)",
  accent: "hsl(212 80% 52%)",
  success: "hsl(150 60% 36%)",
  danger: "hsl(2 70% 50%)",
  dangerSoft: "hsl(2 80% 95%)",
  warningSoft: "hsl(40 95% 92%)",
  warningText: "hsl(32 80% 32%)",
  white: "hsl(0 0% 100%)",
  overlay: "hsl(222 25% 10% / 0.45)"
};

type TScene = {
  heading: string;
  navActive: string;
  list?: boolean;
  panels?: number;
  loading?: boolean;
  button?: string;
  isPressed?: boolean;
  isEditing?: boolean;
  isScrolled?: boolean;
  toast?: string;
  banner?: string;
  notice?: string;
  dialog?: string;
  tokenField?: boolean;
};

const HOME: TScene = { heading: "Home", navActive: "Home" };
const DASHBOARD: TScene = {
  heading: "Checkout latency",
  navActive: "Dashboards",
  panels: 4,
  button: "Edit"
};
const EDITING: TScene = { ...DASHBOARD, isEditing: true, button: "Save dashboard" };
const RENAMED: TScene = { ...DASHBOARD, heading: "Checkout latency (p99)" };

const FRAME_SCENES: [number, TScene][] = [
  [700, HOME],
  [1200, { ...HOME, list: true }],
  [3300, { ...DASHBOARD, panels: 0, loading: true }],
  [4000, DASHBOARD],
  [6100, EDITING],
  [7300, EDITING],
  [8000, { ...EDITING, heading: "Checkout latency (p" }],
  [8600, { ...EDITING, heading: "Checkout latency (p99)" }],
  [9900, { ...EDITING, heading: "Checkout latency (p99)", isPressed: true }],
  [10_300, { ...RENAMED, toast: "Dashboard saved" }],
  [11_000, RENAMED],
  [12_500, { ...RENAMED, banner: "Failed to load annotations: 500 Internal Server Error" }],
  [13_200, { ...RENAMED, banner: "Failed to load annotations: 500 Internal Server Error" }],
  [34_500, { ...RENAMED, isScrolled: true }],
  [35_700, { ...RENAMED, isScrolled: true, notice: "Opening status.example.org was blocked" }],
  [37_100, { ...RENAMED, dialog: "Delete this panel?" }],
  [38_500, RENAMED],
  [39_900, { ...RENAMED, notice: "Downloading checkout-latency.pdf was blocked" }],
  [41_600, { ...RENAMED, tokenField: true }],
  [42_800, { ...RENAMED, tokenField: true, banner: "Permission denied: 403 Forbidden" }],
  [45_000, RENAMED]
];

const json = (value: unknown) => JSON.stringify(value);

const appUrl = (path: string) => `${APP_ORIGIN}${path}`;

const REQUEST_HEADERS = {
  accept: "application/json",
  cookie: "•••",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.0.0"
};

const request = (
  elapsedMs: number,
  id: string,
  method: string,
  url: string,
  resourceType: string,
  body?: string
): TEnvelope => ({
  type: "http_request",
  elapsedMs,
  id,
  method,
  url,
  headers: body
    ? { ...REQUEST_HEADERS, "content-type": "application/json", authorization: "•••" }
    : REQUEST_HEADERS,
  resourceType,
  bodySize: body?.length ?? 0,
  ...(body ? { body } : {})
});

const response = (
  elapsedMs: number,
  id: string,
  status: number,
  statusText: string,
  mimeType: string,
  { body, bodySize, fromCache = false }: { body?: string; bodySize?: number; fromCache?: boolean }
): TEnvelope => ({
  type: "http_response",
  elapsedMs,
  id,
  status,
  statusText,
  headers: {
    "content-type": mimeType,
    "cache-control": fromCache ? "max-age=31536000" : "no-store",
    "x-request-id": `req-${id}`
  },
  mimeType,
  bodySize: bodySize ?? body?.length ?? 0,
  ...(body ? { body } : {}),
  fromCache
});

const input = (
  elapsedMs: number,
  kind: string,
  extra: Record<string, unknown> = {}
): TEnvelope => ({
  type: "input",
  elapsedMs,
  kind,
  ...extra
});

const navigation = (elapsedMs: number, path: string, title: string): TEnvelope => ({
  type: "navigation",
  elapsedMs,
  url: appUrl(path),
  title
});

const QUERY_BODY = json({
  queries: [
    {
      refId: "A",
      datasource: { type: "prometheus", uid: "prom-main" },
      expr: "histogram_quantile(0.99, sum(rate(checkout_latency_seconds_bucket[5m])) by (le))"
    }
  ],
  from: "now-6h",
  to: "now"
});

const SAVE_BODY = json({
  dashboard: {
    uid: "abc123",
    title: "Checkout latency (p99)",
    version: 6,
    panels: [{ id: 1, type: "timeseries", title: "p99 latency" }]
  },
  folderUid: "payments",
  message: "Rename to p99",
  overwrite: false
});

const TYPED = " (p99)";

const ACTIVITY: TEnvelope[] = [
  {
    type: "session_start",
    elapsedMs: 0,
    url: appUrl("/"),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    userAgent: REQUEST_HEADERS["user-agent"]
  },
  request(120, "doc-1", "GET", appUrl("/"), "Document"),
  response(360, "doc-1", 200, "OK", "text/html", { bodySize: 18_342 }),
  navigation(380, "/", "Home · Ops Dashboards"),
  request(420, "js-1", "GET", appUrl("/public/build/app.4f2c1.js"), "Script"),
  request(430, "css-1", "GET", appUrl("/public/build/app.9a7e2.css"), "Stylesheet"),
  response(500, "css-1", 200, "OK", "text/css", { bodySize: 92_004, fromCache: true }),
  response(520, "js-1", 200, "OK", "application/javascript", {
    bodySize: 845_112,
    fromCache: true
  }),
  request(900, "search-1", "GET", appUrl("/api/search?type=dash-db&limit=30"), "XHR"),
  response(1080, "search-1", 200, "OK", "application/json", {
    body: json([
      { uid: "abc123", title: "Checkout latency", folderTitle: "Payments" },
      { uid: "def456", title: "API gateway errors", folderTitle: "Platform" },
      { uid: "ghi789", title: "Queue depth", folderTitle: "Platform" }
    ])
  }),
  input(3000, "click", { x: 330, y: 214, target: 'link "Checkout latency"' }),
  navigation(3040, "/d/abc123/checkout-latency", "Checkout latency · Ops Dashboards"),
  request(3100, "dash-1", "GET", appUrl("/api/dashboards/uid/abc123"), "XHR"),
  response(3260, "dash-1", 200, "OK", "application/json", {
    body: json({ dashboard: { uid: "abc123", title: "Checkout latency", version: 6 } })
  }),
  request(3400, "query-1", "POST", appUrl("/api/ds/query"), "Fetch", QUERY_BODY),
  response(3900, "query-1", 200, "OK", "application/json", {
    body: json({ results: { A: { status: 200, frames: [{ schema: { name: "p99" } }] } } })
  }),
  input(6000, "click", { x: 1130, y: 100, target: 'button "Edit"' }),
  input(7000, "click", { x: 520, y: 108, target: 'textbox "Dashboard title"' }),
  ...TYPED.split("").map((char, index) =>
    input(7400 + index * 180, "key", { target: 'textbox "Dashboard title"', text: char })
  ),
  input(9800, "click", { x: 1130, y: 100, target: 'button "Save dashboard"' }),
  request(9850, "save-1", "POST", appUrl("/api/dashboards/db"), "XHR", SAVE_BODY),
  response(10_250, "save-1", 200, "OK", "application/json", {
    body: json({
      uid: "abc123",
      url: "/d/abc123/checkout-latency-p99",
      status: "success",
      version: 7
    })
  }),
  navigation(10_400, "/d/abc123/checkout-latency-p99", "Checkout latency (p99) · Ops Dashboards"),
  request(12_000, "annotations-1", "GET", appUrl("/api/annotations?dashboardUID=abc123"), "XHR"),
  response(12_400, "annotations-1", 500, "Internal Server Error", "application/json", {
    body: json({ message: "Failed to fetch annotations", error: "database is locked" })
  }),
  input(34_000, "scroll", { x: 700, y: 500 }),
  input(34_200, "scroll", { x: 700, y: 500 }),
  input(34_400, "scroll", { x: 700, y: 500 }),
  input(35_500, "click", { x: 260, y: 700, target: 'link "Status page"' }),
  { type: "blocked_request", elapsedMs: 35_560, method: "GET", url: "https://status.example.org/" },
  input(37_000, "click", { x: 1180, y: 160, target: 'button "Delete panel"' }),
  {
    type: "dialog",
    elapsedMs: 37_050,
    kind: "confirm",
    message: "Delete this panel?",
    accepted: false
  },
  input(39_500, "click", { x: 1130, y: 100, target: 'button "Export PDF"' }),
  {
    type: "download",
    elapsedMs: 39_800,
    url: appUrl("/api/reports/abc123.pdf"),
    filename: "checkout-latency.pdf",
    allowed: false
  },
  input(41_000, "click", { x: 520, y: 640, target: 'textbox "Service account token"' }),
  input(41_500, "text", { target: 'textbox "Service account token"', text: "•••" }),
  request(42_500, "delete-1", "DELETE", appUrl("/api/dashboards/uid/old-draft"), "XHR"),
  response(42_700, "delete-1", 403, "Forbidden", "application/json", {
    body: json({ message: "Permission denied" })
  }),
  request(44_000, "ws-1", "GET", "wss://dash.internal.example.com/api/live/ws", "WebSocket"),
  { type: "session_end", elapsedMs: 46_000, reason: "user_quit" }
];

const drawButton = (
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  isPressed = false
) => {
  ctx.fillStyle = isPressed ? COLORS.text : COLORS.accent;
  ctx.fillRect(x, y, 150, 40);
  ctx.fillStyle = COLORS.white;
  ctx.font = "600 15px sans-serif";
  ctx.fillText(label, x + 16, y + 26);
};

const PANEL_TITLES = [
  "p99 latency",
  "p50 latency",
  "Error rate",
  "Throughput",
  "Retries",
  "Timeouts"
];

const drawPanels = (ctx: CanvasRenderingContext2D, scene: TScene, seq: number) => {
  const count = scene.isScrolled ? 6 : (scene.panels ?? 0);
  const offset = scene.isScrolled ? -150 : 0;
  for (let index = 0; index < count; index += 1) {
    const x = 232 + (index % 2) * 516;
    const y = 150 + Math.floor(index / 2) * 300 + offset;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, 500, 280);
    ctx.strokeStyle = COLORS.border;
    ctx.strokeRect(x, y, 500, 280);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 15px sans-serif";
    ctx.fillText(PANEL_TITLES[index], x + 16, y + 28);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let point = 0; point <= 24; point += 1) {
      const px = x + 16 + point * 19.5;
      const py = y + 160 + Math.sin(point * 0.7 + index * 2.1 + seq * 0.25) * 60;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
};

const drawScene = (
  ctx: CanvasRenderingContext2D,
  scene: TScene,
  seq: number,
  elapsedMs: number,
  cursor: { x: number; y: number } | null
) => {
  const { width, height } = VIEWPORT;
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.topBar;
  ctx.fillRect(0, 0, width, 56);
  ctx.fillStyle = COLORS.white;
  ctx.font = "600 20px sans-serif";
  ctx.fillText("Ops Dashboards", 24, 35);
  ctx.fillStyle = COLORS.search;
  ctx.fillRect(420, 12, 440, 32);

  ctx.fillStyle = COLORS.nav;
  ctx.fillRect(0, 56, 200, height - 56);
  ["Home", "Dashboards", "Alerts", "Settings"].forEach((item, index) => {
    ctx.fillStyle = scene.navActive === item ? COLORS.accent : COLORS.text;
    ctx.font = "15px sans-serif";
    ctx.fillText(item, 24, 100 + index * 40);
  });

  if (scene.isEditing) {
    ctx.strokeStyle = COLORS.accent;
    ctx.strokeRect(224, 78, 560, 44);
  }
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 26px sans-serif";
  ctx.fillText(scene.heading, 232, 110);
  if (scene.button) drawButton(ctx, scene.button, 1090, 80, scene.isPressed);

  if (scene.list) {
    ["Checkout latency", "API gateway errors", "Queue depth"].forEach((title, index) => {
      const y = 160 + index * 56;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(232, y, 1016, 48);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(232, y, 1016, 48);
      ctx.fillStyle = COLORS.accent;
      ctx.font = "16px sans-serif";
      ctx.fillText(title, 252, y + 30);
    });
  }
  if (scene.loading) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "16px sans-serif";
    ctx.fillText("Loading panels...", 232, 180);
  }
  drawPanels(ctx, scene, seq);

  if (scene.tokenField) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(232, 610, 560, 56);
    ctx.strokeStyle = COLORS.accent;
    ctx.strokeRect(232, 610, 560, 56);
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px sans-serif";
    ctx.fillText("Service account token  ••••••••••••", 248, 644);
  }
  if (scene.banner) {
    ctx.fillStyle = COLORS.dangerSoft;
    ctx.fillRect(232, 130, 1016, 40);
    ctx.fillStyle = COLORS.danger;
    ctx.font = "15px sans-serif";
    ctx.fillText(scene.banner, 248, 156);
  }
  if (scene.notice) {
    ctx.fillStyle = COLORS.warningSoft;
    ctx.fillRect(232, 130, 1016, 40);
    ctx.fillStyle = COLORS.warningText;
    ctx.font = "15px sans-serif";
    ctx.fillText(scene.notice, 248, 156);
  }
  if (scene.toast) {
    ctx.fillStyle = COLORS.success;
    ctx.fillRect(width - 300, height - 96, 268, 56);
    ctx.fillStyle = COLORS.white;
    ctx.font = "600 16px sans-serif";
    ctx.fillText(scene.toast, width - 280, height - 62);
  }
  if (scene.dialog) {
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(430, 300, 420, 180);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 18px sans-serif";
    ctx.fillText(scene.dialog, 460, 350);
    drawButton(ctx, "Cancel", 520, 410);
    drawButton(ctx, "Delete", 680, 410);
  }

  if (cursor) {
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.moveTo(cursor.x, cursor.y);
    ctx.lineTo(cursor.x, cursor.y + 18);
    ctx.lineTo(cursor.x + 12, cursor.y + 13);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = "12px monospace";
  ctx.fillText(`synthetic frame ${seq} · ${formatPlaybackTime(elapsedMs)}`, 216, height - 16);
};

const renderFrames = (): TEnvelope[] => {
  const canvas = document.createElement("canvas");
  canvas.width = VIEWPORT.width;
  canvas.height = VIEWPORT.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const clicks = ACTIVITY.filter((envelope) => envelope.type === "input" && "x" in envelope);
  return FRAME_SCENES.map(([elapsedMs, scene], index) => {
    const lastClick = [...clicks].reverse().find((click) => click.elapsedMs <= elapsedMs);
    drawScene(
      ctx,
      scene,
      index + 1,
      elapsedMs,
      lastClick ? { x: Number(lastClick.x), y: Number(lastClick.y) } : null
    );
    return {
      type: "frame",
      elapsedMs,
      seq: index + 1,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      jpeg: canvas.toDataURL("image/jpeg", 0.7).replace(/^data:image\/jpeg;base64,/, "")
    };
  });
};

const toBase64 = (text: string) => {
  let binary = "";
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

// TSessionEvent's eventType predates browser recordings, which the gateway writes as "browser"
const toSessionEvent = (envelope: TEnvelope) =>
  ({
    timestamp: new Date(SESSION_STARTED_AT + envelope.elapsedMs).toISOString(),
    eventType: "browser",
    channelType: SessionChannelType.Browser,
    data: toBase64(JSON.stringify(envelope)),
    elapsedTime: envelope.elapsedMs / 1000
  }) as unknown as TSessionEvent;

const buildRecording = (): TSessionEvent[] =>
  [...ACTIVITY, ...renderFrames()]
    .sort((a, b) => a.elapsedMs - b.elapsedMs)
    .map(toSessionEvent);

const brokenChunk = (chunkIndex: number, reason: string, message: string): TBrokenChunkMarker => ({
  __brokenChunk: true,
  chunkIndex,
  reason,
  message
});

// Stands in for chunks that failed verification, the way useDecryptedSessionLogs reports them
const MISSING_CHUNKS = [
  { fromMs: 12_000, toMs: 13_500, marker: brokenChunk(2, "gcm", "Chunk 2 failed verification") },
  { fromMs: 39_000, toMs: 40_500, marker: brokenChunk(5, "missing", "Chunk 5 was not found") }
];

const withMissingChunks = (events: TSessionEvent[]): TReplayEvent[] => {
  const result: TReplayEvent[] = [];
  events.forEach((event) => {
    const ms = event.elapsedTime * 1000;
    MISSING_CHUNKS.forEach(({ toMs, marker }) => {
      if (ms >= toMs && !result.includes(marker)) result.push(marker);
    });
    const isLost = MISSING_CHUNKS.some(({ fromMs, toMs }) => ms >= fromMs && ms < toMs);
    if (!isLost) result.push(event);
  });
  return result;
};

const LIVE_OPENED_AT_MS = 10_000;
// Matches the gateway's upload interval, so the recording grows at the pace a live session does
const LIVE_CHUNK_MS = 10_000;

const RecordedReplay = ({ variant }: { variant: "complete" | "missing-chunks" }) => {
  const events = useMemo(() => {
    const recording = buildRecording();
    return variant === "missing-chunks" ? withMissingChunks(recording) : recording;
  }, [variant]);
  return <BrowserReplayView events={events} />;
};

const LiveReplay = () => {
  const recording = useMemo(buildRecording, []);
  const endMs = recording[recording.length - 1].elapsedTime * 1000;
  const [recordedMs, setRecordedMs] = useState(LIVE_OPENED_AT_MS);
  const isStreaming = recordedMs < endMs;

  useEffect(() => {
    if (!isStreaming) return undefined;
    const timer = setTimeout(() => setRecordedMs((ms) => ms + LIVE_CHUNK_MS), LIVE_CHUNK_MS);
    return () => clearTimeout(timer);
  }, [recordedMs, isStreaming]);

  const events = useMemo(
    () => recording.filter((event) => event.elapsedTime * 1000 <= recordedMs),
    [recording, recordedMs]
  );
  return <BrowserReplayView events={events} isStreaming={isStreaming} />;
};

const StartingReplay = () => {
  const events = useMemo(() => ACTIVITY.slice(0, 1).map(toSessionEvent), []);
  return <BrowserReplayView events={events} isStreaming />;
};

const InSessionSheet: Decorator = (Story, context) => (
  <div className={context.parameters.containerClassName ?? "w-full max-w-[44rem]"}>
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Session Recording</CardTitle>
      </CardHeader>
      <CardContent>
        <Story />
      </CardContent>
    </Card>
  </div>
);

/**
 * Replays a recorded `web-app` PAM session: screen frames from the remote browser on a canvas,
 * with the requests, clicks, typing and page changes the gateway recorded beside it. Every story
 * here draws its frames at runtime, so the view can be checked before a gateway records anything.
 *
 * In the session sheet the card is narrow and the activity list sits under the player; at
 * `@5xl` container width it moves beside it.
 */
const meta = {
  title: "PAM/Browser Replay View",
  component: BrowserReplayView,
  parameters: {
    layout: "padded"
  },
  decorators: [InSessionSheet],
  tags: ["autodocs"],
  args: {
    events: [],
    isStreaming: false
  },
  argTypes: {
    events: {
      table: {
        disable: true
      }
    },
    isStreaming: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof BrowserReplayView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecordedSession: Story = {
  name: "Example: Recorded Session",
  parameters: {
    docs: {
      description: {
        story:
          "A finished 46 second session: page loads, a dashboard rename saved with a POST, a 500, a blocked host, a dismissed dialog, a blocked download and a 403. The 21 second idle stretch is skipped while Skip Idle is on."
      }
    }
  },
  render: () => <RecordedReplay variant="complete" />
};

export const WideLayout: Story = {
  name: "Example: Wide Layout",
  parameters: {
    containerClassName: "w-full max-w-7xl",
    docs: {
      description: {
        story: "With room to spare, the activity list moves beside the player."
      }
    }
  },
  render: () => <RecordedReplay variant="complete" />
};

export const LiveSession: Story = {
  name: "Example: Live Session",
  parameters: {
    docs: {
      description: {
        story:
          "An active session opened ten seconds in. Ten more seconds of recording arrive every ten seconds, as the gateway uploads chunks, and the player follows the live edge until you scrub back. Jump to Live returns to it."
      }
    }
  },
  render: () => <LiveReplay />
};

export const MissingChunks: Story = {
  name: "Example: Missing Chunks",
  parameters: {
    docs: {
      description: {
        story:
          "Two chunks failed to load. Their stretches are marked on the playback bar and listed in the activity, and the rest of the recording still plays."
      }
    }
  },
  render: () => <RecordedReplay variant="missing-chunks" />
};

export const WaitingForFrames: Story = {
  name: "Example: Waiting For Frames",
  parameters: {
    docs: {
      description: {
        story: "A live session whose browser has not painted yet."
      }
    }
  },
  render: () => <StartingReplay />
};
