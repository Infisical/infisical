import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSessionEvent } from "../types";
import {
  decryptOneChunk,
  detectChunkGaps,
  importSessionKeyFromBase64,
  PAM_PLAYBACK_MAX_CHUNKS,
  PAM_PLAYBACK_MAX_TOTAL_EVENTS
} from "./decrypt";
import { TBrokenChunkMarker, TPamSessionPlayback } from "./types";

export const pamPlaybackKeys = {
  all: ["pam", "playback"] as const,
  playback: (sessionId: string) => [...pamPlaybackKeys.all, sessionId] as const
};

const fetchPlayback = async (sessionId: string): Promise<TPamSessionPlayback> => {
  const { data } = await apiRequest.get<TPamSessionPlayback>(
    `/api/v1/pam/sessions/${sessionId}/playback`
  );
  return data;
};

const PLAYBACK_POLL_INTERVAL_MS = 5000;

export const useGetPamSessionPlayback = (sessionId: string, enabled = true, isActive = false) =>
  useQuery({
    queryKey: pamPlaybackKeys.playback(sessionId),
    enabled: Boolean(sessionId) && enabled,
    queryFn: () => fetchPlayback(sessionId),
    staleTime: 0,
    gcTime: 0,
    refetchInterval: isActive
      ? (query) => (query.state.data?.sessionComplete ? false : PLAYBACK_POLL_INTERVAL_MS)
      : false
  });

export type DecryptedChunkRecord = {
  chunkIndex: number;
  events: (TSessionEvent | TBrokenChunkMarker)[];
};

export type PlaybackDecryptState = {
  loading: boolean;
  error?: string;
  events: (TSessionEvent | TBrokenChunkMarker)[];
  brokenChunks: TBrokenChunkMarker[];
  missingChunks: number[];
  totalChunks: number;
  totalDurationMs: number;
  sessionComplete: boolean;
};

const fallbackUrlBuilderFor = (sessionId: string) => (chunkIndex: number) =>
  `/api/v1/pam/sessions/${sessionId}/chunks/${chunkIndex}/ciphertext`;

export const useDecryptedSessionLogs = (
  sessionId: string,
  enabled = true,
  isActive = false
): PlaybackDecryptState => {
  const playbackQuery = useGetPamSessionPlayback(sessionId, enabled, isActive);
  const playback = playbackQuery.data;
  const [state, setState] = useState<Omit<PlaybackDecryptState, "sessionComplete">>({
    loading: true,
    events: [],
    brokenChunks: [],
    missingChunks: [],
    totalChunks: 0,
    totalDurationMs: 0
  });

  const fallbackUrlBuilder = useMemo(() => fallbackUrlBuilderFor(sessionId), [sessionId]);

  // Refs for incremental decryption across poll cycles (active sessions only)
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  const decryptedIndicesRef = useRef(new Set<number>());
  const accChunkEventsRef = useRef(new Map<number, unknown[]>());
  const accEventCountRef = useRef(0);
  const accBrokenRef = useRef<TBrokenChunkMarker[]>([]);
  const prevSessionIdRef = useRef(sessionId);

  if (prevSessionIdRef.current !== sessionId) {
    sessionKeyRef.current = null;
    decryptedIndicesRef.current = new Set();
    accChunkEventsRef.current = new Map();
    accEventCountRef.current = 0;
    accBrokenRef.current = [];
    prevSessionIdRef.current = sessionId;
  }

  useEffect(() => {
    if (!enabled || !playback) return undefined;
    let cancelled = false;

    const run = async () => {
      // Cache session key across poll cycles
      if (!sessionKeyRef.current) {
        try {
          sessionKeyRef.current = await importSessionKeyFromBase64(playback.sessionKey);
        } catch (err) {
          if (!cancelled) {
            setState((s) => ({
              ...s,
              loading: false,
              error: `Invalid session key: ${(err as Error).message}`
            }));
          }
          return;
        }
      }
      const sessionKey = sessionKeyRef.current;

      const { projectId } = playback;
      const sortedChunks = [...playback.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const totalDurationMs = sortedChunks.reduce((max, c) => Math.max(max, c.endElapsedMs), 0);

      if (sortedChunks.length > PAM_PLAYBACK_MAX_CHUNKS) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: `Session has ${sortedChunks.length} chunks, exceeds playback limit of ${PAM_PLAYBACK_MAX_CHUNKS}`
          }));
        }
        return;
      }

      const missingChunks = detectChunkGaps(sortedChunks);

      const useIncremental = isActive || decryptedIndicesRef.current.size > 0;

      if (useIncremental) {
        const newChunks = sortedChunks.filter(
          (c) => !decryptedIndicesRef.current.has(c.chunkIndex)
        );

        for (let ci = 0; ci < newChunks.length; ci += 1) {
          if (cancelled) return;

          const chunk = newChunks[ci];
          decryptedIndicesRef.current.add(chunk.chunkIndex);
          // eslint-disable-next-line no-await-in-loop
          const r = await decryptOneChunk({
            chunk,
            sessionKey,
            projectId,
            sessionId,
            fallbackUrlBuilder
          });

          if (cancelled) return;

          if (r.ok) {
            accChunkEventsRef.current.set(chunk.chunkIndex, r.events);
            accEventCountRef.current += r.events.length;
            if (accEventCountRef.current > PAM_PLAYBACK_MAX_TOTAL_EVENTS) {
              accBrokenRef.current.push({
                __brokenChunk: true,
                chunkIndex: r.chunkIndex,
                reason: "limit",
                message: `Total event count exceeds playback limit of ${PAM_PLAYBACK_MAX_TOTAL_EVENTS}; remaining chunks skipped`
              });
              break;
            }
          } else {
            const marker: TBrokenChunkMarker = {
              __brokenChunk: true,
              chunkIndex: r.chunkIndex,
              reason: r.reason,
              message: r.message
            };
            accBrokenRef.current.push(marker);
            accChunkEventsRef.current.set(chunk.chunkIndex, [marker]);
          }
        }

        if (cancelled) return;

        if (playback.sessionComplete) {
          for (let mi = 0; mi < missingChunks.length; mi += 1) {
            const idx = missingChunks[mi];
            if (!accChunkEventsRef.current.has(idx)) {
              const marker: TBrokenChunkMarker = {
                __brokenChunk: true,
                chunkIndex: idx,
                reason: "missing",
                message: `Chunk ${idx} was not found in the recording`
              };
              accBrokenRef.current.push(marker);
              accChunkEventsRef.current.set(idx, [marker]);
            }
          }
        }

        const orderedEvents = [...accChunkEventsRef.current.keys()]
          .sort((a, b) => a - b)
          .flatMap((key) => accChunkEventsRef.current.get(key) ?? []);

        setState({
          loading: isActive && !playback.sessionComplete,
          events: orderedEvents as (TSessionEvent | TBrokenChunkMarker)[],
          brokenChunks: [...accBrokenRef.current],
          missingChunks,
          totalChunks: sortedChunks.length,
          totalDurationMs
        });
      } else {
        // Full path: decrypt all chunks with gap markers (completed sessions)
        const missingSet = new Set(missingChunks);
        const events: (TSessionEvent | TBrokenChunkMarker)[] = [];
        const brokenChunks: PlaybackDecryptState["brokenChunks"] = [];
        let chunkIdx = 0;

        const maxIndex = sortedChunks.length ? sortedChunks[sortedChunks.length - 1].chunkIndex : 0;

        setState((s) => ({
          ...s,
          totalChunks: sortedChunks.length,
          totalDurationMs,
          missingChunks
        }));

        for (let i = 0; i <= maxIndex; i += 1) {
          if (cancelled) return;

          if (missingSet.has(i)) {
            const marker: TBrokenChunkMarker = {
              __brokenChunk: true,
              chunkIndex: i,
              reason: "missing",
              message: `Chunk ${i} was not found in the recording`
            };
            events.push(marker);
            brokenChunks.push(marker);
          } else {
            // eslint-disable-next-line no-await-in-loop
            const r = await decryptOneChunk({
              chunk: sortedChunks[chunkIdx],
              sessionKey,
              projectId,
              sessionId,
              fallbackUrlBuilder
            });
            chunkIdx += 1;
            if (r.ok) {
              events.push(...(r.events as TSessionEvent[]));
              if (events.length > PAM_PLAYBACK_MAX_TOTAL_EVENTS) {
                brokenChunks.push({
                  __brokenChunk: true,
                  chunkIndex: r.chunkIndex,
                  reason: "limit",
                  message: `Total event count exceeds playback limit of ${PAM_PLAYBACK_MAX_TOTAL_EVENTS}; remaining chunks skipped`
                });
                break;
              }
            } else {
              const marker: TBrokenChunkMarker = {
                __brokenChunk: true,
                chunkIndex: r.chunkIndex,
                reason: r.reason,
                message: r.message
              };
              events.push(marker);
              brokenChunks.push(marker);
            }
          }

          setState({
            loading: true,
            events: [...events],
            brokenChunks: [...brokenChunks],
            missingChunks,
            totalChunks: sortedChunks.length,
            totalDurationMs
          });
        }

        if (cancelled) return;

        setState({
          loading: false,
          events,
          brokenChunks,
          missingChunks,
          totalChunks: sortedChunks.length,
          totalDurationMs
        });
      }
    };

    run().catch((err) => {
      if (!cancelled) {
        setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [playback, enabled, sessionId, fallbackUrlBuilder, isActive]);

  return {
    ...state,
    sessionComplete: playback?.sessionComplete ?? false
  };
};
