import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft, faPause, faPlay, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, PageHeader, Spinner } from "@app/components/v2";
import { apiRequest } from "@app/config/request";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPamSessionActions } from "@app/context/ProjectPermissionContext/types";
import { useGetPamSessionById } from "@app/hooks/api/pam";
import { TPamSessionLogsPage } from "@app/hooks/api/pam/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { parseRdpLogEntry, RdpEvent, RdpReplayPlayer } from "./rdpReplayPlayer";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const LOGS_FETCH_BATCH = 100;

const formatMs = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const useAllSessionEvents = (sessionId: string) => {
  const [events, setEvents] = useState<RdpEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);
      setEvents([]);
      setProgress(0);
      const accumulated: RdpEvent[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && !cancelled) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await apiRequest.get<TPamSessionLogsPage>(
            `/api/v1/pam/sessions/${sessionId}/logs`,
            { params: { offset, limit: LOGS_FETCH_BATCH } }
          );
          for (const entry of data.logs) {
            const ev = parseRdpLogEntry(entry);
            if (ev) accumulated.push(ev);
          }
          offset += data.batchCount;
          hasMore = data.hasMore;
          if (!cancelled) setProgress(accumulated.length);
        } catch {
          hasMore = false;
        }
      }
      if (cancelled) return;
      accumulated.sort((a, b) => a.elapsedMs - b.elapsedMs);
      setEvents(accumulated);
      setIsLoading(false);
    };

    fetchAll().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { events, isLoading, progress };
};

const Page = () => {
  const sessionId = useParams({
    from: ROUTE_PATHS.Pam.PamSessionReplayPage.id,
    select: (el) => el.sessionId
  });
  const { data: session } = useGetPamSessionById(sessionId);
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<RdpReplayPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [keyLog, setKeyLog] = useState<
    { elapsedMs: number; scancode?: number; codePoint?: number; release: boolean }[]
  >([]);

  const { events, isLoading, progress } = useAllSessionEvents(sessionId);
  const totalMs = useMemo(() => (events.at(-1)?.elapsedMs ?? 0), [events]);

  useEffect(() => {
    if (!canvasRef.current || events.length === 0) return undefined;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    // RdpReplayPlayer.create() is async because it initializes the WASM
    // decoder on first use. Guard against the effect unmounting mid-init.
    let cancelled = false;
    let player: RdpReplayPlayer | null = null;

    void RdpReplayPlayer.create(events, canvasRef.current, {
      onTick: setCurrentMs,
      onKey: (entry) => setKeyLog((prev) => [...prev.slice(-199), entry]),
      onEnded: () => setIsPlaying(false)
    }).then((p) => {
      if (cancelled) {
        p.dispose();
        return;
      }
      player = p;
      playerRef.current = p;
      (window as unknown as { __rdpPlayer?: RdpReplayPlayer }).__rdpPlayer = p;
    });

    return () => {
      cancelled = true;
      player?.dispose();
      playerRef.current = null;
      delete (window as unknown as { __rdpPlayer?: RdpReplayPlayer }).__rdpPlayer;
    };
  }, [events]);

  const onPlay = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);
  const onPause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);
  const onRestart = useCallback(() => {
    playerRef.current?.restart();
    setIsPlaying(false);
    setKeyLog([]);
  }, []);

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <Link
          to="/organizations/$orgId/projects/pam/$projectId/sessions/$sessionId"
          params={{
            orgId: currentOrg.id,
            projectId: currentProject.id,
            sessionId
          }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Back to session
        </Link>
        <PageHeader
          scope={ProjectType.PAM}
          title={`Replay — ${session?.accountName ?? ""}`}
          description="Scrub through the recorded RDP session. Visual reconstruction covers 16bpp bitmap updates; richer codecs render as blanks."
        />

        {isLoading && (
          <div className="flex items-center gap-3 rounded-md bg-mineshaft-800 p-4 text-mineshaft-300">
            <Spinner size="sm" />
            <span>
              Loading session events
              {progress > 0 ? ` (${progress.toLocaleString()} loaded)` : ""}…
            </span>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="rounded-md bg-mineshaft-800 p-4 text-mineshaft-300">
            No RDP events found for this session. Only sessions recorded after the replay feature
            was added will play back.
          </div>
        )}

        {!isLoading && events.length > 0 && (
          <div className="flex gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="inline-block rounded-md bg-black">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  className="block max-h-[70vh] w-full"
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="solid"
                  colorSchema="primary"
                  leftIcon={<FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />}
                  onClick={isPlaying ? onPause : onPlay}
                >
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <Button
                  variant="outline_bg"
                  leftIcon={<FontAwesomeIcon icon={faRotateLeft} />}
                  onClick={onRestart}
                >
                  Restart
                </Button>
                <span className="font-mono text-sm text-mineshaft-300">
                  {formatMs(currentMs)} / {formatMs(totalMs)}
                </span>
                <span className="text-xs text-mineshaft-500">
                  {events.length.toLocaleString()} events
                </span>
              </div>
            </div>

            <aside className="w-80 shrink-0">
              <div className="flex h-full flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800">
                <div className="border-b border-mineshaft-600 px-3 py-2 text-sm text-mineshaft-200">
                  Input events
                </div>
                <div className="thin-scrollbar flex-1 overflow-auto px-2 py-2">
                  {keyLog.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-mineshaft-500">
                      No keys pressed yet
                    </div>
                  ) : (
                    keyLog.map((k, i) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        className="flex items-baseline gap-2 px-1 py-0.5 font-mono text-xs text-mineshaft-300"
                      >
                        <span className="w-10 text-right text-mineshaft-500">
                          {formatMs(k.elapsedMs)}
                        </span>
                        <span>
                          {k.scancode !== undefined
                            ? `scan 0x${k.scancode.toString(16).padStart(2, "0")}`
                            : `U+${(k.codePoint ?? 0).toString(16).padStart(4, "0")}`}
                        </span>
                        <span className="text-mineshaft-500">{k.release ? "up" : "down"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export const PamSessionReplayPage = () => {
  return (
    <>
      <Helmet>
        <title>Session Replay</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionPamSessionActions.Read}
        a={ProjectPermissionSub.PamSessions}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
