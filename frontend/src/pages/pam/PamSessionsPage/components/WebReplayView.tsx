import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import {
  useDecryptedSessionLogs,
  useGetPamSessionPlayback
} from "@app/hooks/api/pam/session-playback/queries";
import { TPamSessionPlayback } from "@app/hooks/api/pam/session-playback/types";

import { isWebReplayRangeVerified } from "./web-replay-coverage";

type TWebEvent = {
  type: string;
  elapsedMs: number;
  surfaceSeq?: number;
  dialogSeq?: number;
  jpeg?: string;
  width?: number;
  height?: number;
  text?: string;
  message?: string;
  t?: string;
  error?: boolean;
  [key: string]: unknown;
};
const decodeWebEvent = (event: { data: string; elapsedTime: number }): TWebEvent | null => {
  try {
    const bytes = Uint8Array.from(atob(event.data), (char) => char.charCodeAt(0));
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as TWebEvent;
    return typeof data.type === "string" && Number.isFinite(event.elapsedTime)
      ? { ...data, elapsedMs: event.elapsedTime * 1000 }
      : null;
  } catch {
    return null;
  }
};
const label = (event: TWebEvent) => {
  if (event.type === "input")
    return `${event.text ? `Typed ${event.text}` : String(event.kind ?? "Input")}${event.error ? " · dispatch returned an error" : ""}`;
  if (event.type === "action")
    return `${String(event.t)}${event.error ? " · dispatch returned an error" : ""}`;
  if (event.type === "nav") return `Navigation: ${String(event.url)}`;
  if (event.type === "controller") return `Controller ${String(event.action)}`;
  if (event.type === "surface") return `Remote tab ${String(event.action)}`;
  if (event.type === "lifecycle") return String(event.phase);
  return event.type;
};
const clock = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export const WebReplayView = ({
  sessionId,
  initialTimeMs = 0
}: {
  sessionId: string;
  initialTimeMs?: number;
}) => {
  const playback = useGetPamSessionPlayback(sessionId).data;
  const decrypted = useDecryptedSessionLogs(sessionId);
  const [position, setPosition] = useState(initialTimeMs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [filter, setFilter] = useState("all");
  const [availability, setAvailability] = useState<{
    verified: number;
    checked: number;
    cursor: number | null;
  }>();
  const [checking, setChecking] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const events = useMemo(
    () =>
      decrypted.events
        .flatMap((event) => {
          if (!("data" in event) || event.channelType !== "web") return [];
          const decoded = decodeWebEvent(event);
          return decoded ? [decoded] : [];
        })
        .sort((a, b) => a.elapsedMs - b.elapsedMs),
    [decrypted.events]
  );
  const frames = useMemo(
    () => events.filter((event) => event.type === "frame" && event.jpeg),
    [events]
  );
  const duration = Math.max(decrypted.totalDurationMs, events[events.length - 1]?.elapsedMs ?? 0);
  const currentFrame = useMemo(() => {
    let low = 0,
      high = frames.length - 1,
      result: TWebEvent | undefined;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (frames[middle].elapsedMs <= position) {
        result = frames[middle];
        low = middle + 1;
      } else high = middle - 1;
    }
    return result;
  }, [frames, position]);
  const gap = playback?.coverage?.gaps.find(
    (entry) => position * 1000 >= entry.fromElapsedUs && position * 1000 <= entry.toElapsedUs
  );
  const frameVerified = useMemo(
    () =>
      currentFrame &&
      isWebReplayRangeVerified(
        playback?.chunks ?? [],
        new Set(decrypted.brokenChunks.map((entry) => entry.chunkIndex)),
        currentFrame.elapsedMs,
        position
      ),
    [currentFrame, playback?.chunks, decrypted.brokenChunks, position]
  );
  const railEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.type !== "frame" &&
          event.type !== "heartbeat" &&
          (filter === "all" || event.type === filter)
      ),
    [events, filter]
  );
  const [railLimit, setRailLimit] = useState(200);
  const dialog = useMemo(() => {
    let current: TWebEvent | undefined;
    for (const event of events) {
      if (event.elapsedMs > position) break;
      if (event.type === "dialog" && !event.answered) current = event;
      if (event.type === "action" && event.t === "dialog" && current?.dialogSeq === event.dialogSeq)
        current = undefined;
    }
    return current?.surfaceSeq === currentFrame?.surfaceSeq ? current : undefined;
  }, [events, currentFrame, position]);
  useEffect(() => {
    if (!currentFrame?.jpeg || !canvasRef.current) return undefined;
    let cancelled = false;
    setImageError(undefined);
    const bytes = Uint8Array.from(atob(currentFrame.jpeg), (char) => char.charCodeAt(0));
    createImageBitmap(new Blob([bytes], { type: "image/jpeg" }))
      .then((bitmap) => {
        if (!cancelled && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
      })
      .catch(() => setImageError("This recorded frame could not be displayed."));
    return () => {
      cancelled = true;
    };
  }, [currentFrame]);
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last) * speed;
      last = now;
      setPosition((value) => Math.min(duration, value + elapsed));
    }, 50);
    return () => clearInterval(timer);
  }, [playing, speed, duration]);
  useEffect(() => {
    if (position >= duration) setPlaying(false);
  }, [position, duration]);
  useEffect(() => {
    if (playback?.availability)
      setAvailability({
        verified: playback.availability.verifiedChunks,
        checked: playback.availability.checkedChunks,
        cursor: playback.availability.verifyCursor
      });
  }, [playback]);
  const checkMore = async () => {
    if (availability?.cursor === null || availability?.cursor === undefined) return;
    setChecking(true);
    try {
      const { data } = await apiRequest.get<TPamSessionPlayback>(
        `/api/v1/pam/sessions/${sessionId}/playback`,
        { params: { verifyCursor: availability.cursor } }
      );
      if (data.availability) {
        const facts = data.availability;
        setAvailability((previous) => ({
          verified: (previous?.verified ?? 0) + facts.verifiedChunks,
          checked: (previous?.checked ?? 0) + facts.checkedChunks,
          cursor: facts.verifyCursor
        }));
      }
    } catch {
      createNotification({
        type: "error",
        text: "Recording availability could not be checked. Try again."
      });
    } finally {
      setChecking(false);
    }
  };
  const seek = (ms: number) => {
    setPosition(ms);
    const url = new URL(window.location.href);
    url.searchParams.set("t", String(Math.floor(ms)));
    window.history.replaceState(window.history.state, "", url);
  };
  if (decrypted.loading)
    return (
      <div className="flex items-center gap-2 p-6">
        <Spinner size="sm" />
        Loading recording…
      </div>
    );
  if (decrypted.error)
    return (
      <p role="alert" className="p-6 text-danger">
        {decrypted.error}
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Your review of this recording is logged.</p>
      <div className="grid min-h-96 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <div className="relative flex min-h-80 items-center justify-center overflow-hidden border border-border bg-background">
            <canvas
              ref={canvasRef}
              aria-label="Recorded remote browser"
              className="max-h-[70vh] max-w-full"
            />
            {(!frameVerified || gap || imageError) && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-warning">
                {imageError ??
                  (gap
                    ? `Capture gap: ${gap.reason}`
                    : "No verified frame covers this point in the recording.")}
              </div>
            )}
            {dialog && frameVerified && !gap && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 p-8">
                <div className="max-w-md border border-border bg-card p-6">
                  <p className="mb-2 text-xs text-muted">Recorded App Dialog</p>
                  <p className="text-sm whitespace-pre-wrap">{dialog.message}</p>
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <Input
              type="range"
              aria-label="Recording position"
              min={0}
              max={Math.max(1, duration)}
              value={position}
              onChange={(event) => seek(Number(event.target.value))}
            />
            {playback?.coverage?.gaps.map((entry) => (
              <span
                key={`${entry.fromElapsedUs}-${entry.toElapsedUs}-${entry.reason}`}
                className="pointer-events-none absolute bottom-0 h-1 bg-warning"
                title={`Gap: ${entry.reason}`}
                style={{
                  left: `${(entry.fromElapsedUs / 1000 / Math.max(1, duration)) * 100}%`,
                  width: `${((entry.toElapsedUs - entry.fromElapsedUs) / 1000 / Math.max(1, duration)) * 100}%`
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlaying((value) => !value)}
              isDisabled={!frames.length}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <span className="text-sm tabular-nums">
              {clock(position)} / {clock(duration)}
            </span>
            <Select value={String(speed)} onValueChange={(value) => setSpeed(Number(value))}>
              <SelectTrigger className="w-24" aria-label="Playback speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.5, 1, 1.5, 2, 4].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted">
            Active remote tab only. Change-driven JPEG frames at up to 8 fps, with a capture probe
            every 10 seconds. Capture continues while the viewer is detached.
          </p>
        </div>
        <aside className="min-w-0 border border-border bg-card p-3">
          <h2 className="mb-3 font-alliance text-lg">Recording Events</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filter recording events">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "all",
                "input",
                "action",
                "nav",
                "surface",
                "dialog",
                "controller",
                "lifecycle",
                "policy",
                "gap"
              ].map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "All Events" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ol className="mt-3 max-h-[65vh] space-y-1 overflow-y-auto">
            {railEvents.slice(0, railLimit).map((event) => (
              <li
                key={`${event.elapsedMs}-${event.type}-${String(event.seq ?? event.dialogSeq ?? event.surfaceSeq ?? event.phase ?? "")}`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                  onClick={() => seek(event.elapsedMs)}
                >
                  <span className="mr-2 shrink-0 text-xs text-muted tabular-nums">
                    {clock(event.elapsedMs)}
                  </span>
                  <span className="min-w-0 break-words">{label(event)}</span>
                </Button>
              </li>
            ))}
          </ol>
          {railEvents.length > railLimit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRailLimit((value) => value + 200)}
            >
              Show More Events
            </Button>
          )}
        </aside>
      </div>
      {decrypted.brokenChunks.map((chunk) => (
        <p key={chunk.chunkIndex} role="alert" className="text-sm text-danger">
          Chunk {chunk.chunkIndex} failed verification: {chunk.message}
        </p>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Recording Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Badge variant="warning">Participant-level — storage retention not verified</Badge>
          <dl className="grid gap-4 md:grid-cols-3">
            <div>
              <dt className="mb-1 font-medium">Coverage</dt>
              <dd>
                {playback?.coverage
                  ? `${playback.coverage.presentChunks} of ${playback.coverage.expectedChunks} expected chunks · ${playback.coverage.gaps.length} known gaps · ${playback.coverage.tailSealed ? "tail sealed" : "tail not sealed"}`
                  : "Not yet reported"}
              </dd>
            </div>
            <div>
              <dt className="mb-1 font-medium">Integrity</dt>
              <dd>
                {playback?.integrity?.manifestSignatureVerified
                  ? "Platform signature verified"
                  : "Signature not verified"}{" "}
                · {playback?.integrity?.manifestStatus ?? "pending"}
              </dd>
            </div>
            <div>
              <dt className="mb-1 font-medium">Availability</dt>
              <dd>
                Verified {availability?.verified ?? 0} of {playback?.chunks.length ?? 0} chunks ·{" "}
                {playback?.availability?.versionPinned
                  ? "Exact object versions pinned"
                  : "Object versions not pinned"}
              </dd>
              {availability?.cursor !== null && availability?.cursor !== undefined && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  isPending={checking}
                  onClick={() => {
                    checkMore();
                  }}
                >
                  Verify Next Chunks
                </Button>
              )}
            </div>
          </dl>
          {playback?.manifest?.statusDetail && (
            <p className="text-warning">{playback.manifest.statusDetail}</p>
          )}
          <p className="text-xs text-muted">
            The manifest signature authenticates the platform’s sealed evidence statement: which
            chunks, digests, versions and status were recorded. It does not prove retention,
            application success or independently witnessed completeness.
          </p>
          <p>
            Recorded input shows what the broker dispatched to the remote browser. A dispatch error
            does not prove that the action was not executed.
          </p>
          <p>
            Typed input, including anything typed into password fields, is part of this recording;
            anyone who can replay it can see it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
