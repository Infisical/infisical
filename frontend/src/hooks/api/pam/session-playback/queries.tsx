import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  DecryptedChunkResult,
  decryptOneChunk,
  detectChunkGaps,
  importSessionKeyFromBase64,
  PAM_PLAYBACK_MAX_CHUNKS,
  PAM_PLAYBACK_MAX_TOTAL_EVENTS
} from "./decrypt";
import { TBrokenChunkMarker, TPamPlaybackBundle } from "./types";

export const pamPlaybackKeys = {
  all: ["pam", "playback"] as const,
  bundle: (sessionId: string) => [...pamPlaybackKeys.all, "bundle", sessionId] as const
};

const fetchBundle = async (sessionId: string): Promise<TPamPlaybackBundle> => {
  const { data } = await apiRequest.get<TPamPlaybackBundle>(
    `/api/v1/pam/sessions/${sessionId}/playback`
  );
  return data;
};

const PLAYBACK_POLL_INTERVAL_MS = 5000;

export const useGetPamSessionPlaybackBundle = (
  sessionId: string,
  enabled = true,
  isActive = false
) =>
  useQuery({
    queryKey: pamPlaybackKeys.bundle(sessionId),
    enabled: Boolean(sessionId) && enabled,
    queryFn: () => fetchBundle(sessionId),
    staleTime: 0,
    gcTime: 0,
    refetchInterval: isActive
      ? (query) => (query.state.data?.sessionComplete ? false : PLAYBACK_POLL_INTERVAL_MS)
      : false
  });

export type DecryptedChunkRecord = {
  chunkIndex: number;
  events: unknown[];
};

export type PlaybackDecryptState = {
  legacy: boolean;
  loading: boolean;
  error?: string;
  events: unknown[];
  brokenChunks: TBrokenChunkMarker[];
  missingChunks: number[];
  totalChunks: number;
  totalDurationMs: number;
  sessionComplete: boolean;
};

const fallbackUrlBuilderFor = (sessionId: string) => (chunkIndex: number) =>
  `/api/v1/pam/sessions/${sessionId}/chunks/${chunkIndex}/ciphertext`;

const collectChunkResult = (
  r: Awaited<DecryptedChunkResult>,
  events: unknown[],
  brokenChunks: TBrokenChunkMarker[],
  inlineMarkers = false
): boolean => {
  if (r.ok) {
    events.push(...r.events);
    if (events.length > PAM_PLAYBACK_MAX_TOTAL_EVENTS) {
      brokenChunks.push({
        __brokenChunk: true,
        chunkIndex: r.chunkIndex,
        reason: "limit",
        message: `Total event count exceeds playback limit of ${PAM_PLAYBACK_MAX_TOTAL_EVENTS}; remaining chunks skipped`
      });
      return true;
    }
  } else {
    const marker: TBrokenChunkMarker = {
      __brokenChunk: true,
      chunkIndex: r.chunkIndex,
      reason: r.reason,
      message: r.message
    };
    brokenChunks.push(marker);
    if (inlineMarkers) events.push(marker);
  }
  return false;
};

export const useDecryptedSessionLogs = (
  sessionId: string,
  enabled = true,
  isActive = false
): PlaybackDecryptState => {
  const bundleQuery = useGetPamSessionPlaybackBundle(sessionId, enabled, isActive);
  const bundle = bundleQuery.data;
  const [state, setState] = useState<Omit<PlaybackDecryptState, "sessionComplete">>({
    legacy: false,
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
  const accEventsRef = useRef<unknown[]>([]);
  const accBrokenRef = useRef<TBrokenChunkMarker[]>([]);
  const prevSessionIdRef = useRef(sessionId);

  if (prevSessionIdRef.current !== sessionId) {
    sessionKeyRef.current = null;
    decryptedIndicesRef.current = new Set();
    accEventsRef.current = [];
    accBrokenRef.current = [];
    prevSessionIdRef.current = sessionId;
  }

  useEffect(() => {
    if (!enabled || !bundle) return undefined;
    let cancelled = false;

    const run = async () => {
      // Legacy path: backend has not been upgraded for this session, so we have no session key
      // Fall back to the existing /logs endpoint via the consumer
      if (bundle.legacy) {
        if (!cancelled) {
          setState({
            legacy: true,
            loading: false,
            events: [],
            brokenChunks: [],
            missingChunks: [],
            totalChunks: 0,
            totalDurationMs: 0
          });
        }
        return;
      }

      if (!bundle.sessionKey) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Missing session key in playback bundle"
          }));
        }
        return;
      }

      // Cache session key across poll cycles
      if (!sessionKeyRef.current) {
        try {
          sessionKeyRef.current = await importSessionKeyFromBase64(bundle.sessionKey);
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

      const projectId = bundle.projectId ?? "";
      const sortedChunks = [...bundle.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
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
          // eslint-disable-next-line no-await-in-loop
          const r = await decryptOneChunk({
            chunk,
            sessionKey,
            projectId,
            sessionId,
            fallbackUrlBuilder
          });

          decryptedIndicesRef.current.add(chunk.chunkIndex);

          if (collectChunkResult(r, accEventsRef.current, accBrokenRef.current)) break;
        }

        if (!cancelled) {
          setState({
            legacy: false,
            loading: isActive && !bundle.sessionComplete,
            events: [...accEventsRef.current],
            brokenChunks: [...accBrokenRef.current],
            missingChunks,
            totalChunks: sortedChunks.length,
            totalDurationMs
          });
        }
      } else {
        // Full path: decrypt all chunks with gap markers (completed sessions)
        const missingSet = new Set(missingChunks);
        const events: unknown[] = [];
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
            if (collectChunkResult(r, events, brokenChunks, true)) break;
          }

          setState({
            legacy: false,
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
          legacy: false,
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
  }, [bundle, enabled, sessionId, fallbackUrlBuilder, isActive]);

  return {
    ...state,
    sessionComplete: bundle?.sessionComplete ?? false
  };
};
