import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
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

export const useGetPamSessionPlaybackBundle = (sessionId: string, enabled = true) =>
  useQuery({
    queryKey: pamPlaybackKeys.bundle(sessionId),
    enabled: Boolean(sessionId) && enabled,
    queryFn: () => fetchBundle(sessionId),
    staleTime: 0,
    gcTime: 0
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
};

const fallbackUrlBuilderFor = (sessionId: string) => (chunkIndex: number) =>
  `/api/v1/pam/sessions/${sessionId}/chunks/${chunkIndex}/ciphertext`;

export const useDecryptedSessionLogs = (
  sessionId: string,
  enabled = true
): PlaybackDecryptState => {
  const bundleQuery = useGetPamSessionPlaybackBundle(sessionId, enabled);
  const bundle = bundleQuery.data;
  const [state, setState] = useState<PlaybackDecryptState>({
    legacy: false,
    loading: true,
    events: [],
    brokenChunks: [],
    missingChunks: [],
    totalChunks: 0,
    totalDurationMs: 0
  });

  const fallbackUrlBuilder = useMemo(() => fallbackUrlBuilderFor(sessionId), [sessionId]);

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

      let sessionKey: CryptoKey;
      try {
        sessionKey = await importSessionKeyFromBase64(bundle.sessionKey);
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
      const missingSet = new Set(missingChunks);

      const events: unknown[] = [];
      const brokenChunks: PlaybackDecryptState["brokenChunks"] = [];
      let chunkIdx = 0;

      const maxIndex = sortedChunks.length ? sortedChunks[sortedChunks.length - 1].chunkIndex : 0;

      // Publish total before any chunk decrypts.
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
            events.push(...r.events);
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
    };

    run().catch((err) => {
      if (!cancelled) {
        setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bundle, enabled, sessionId, fallbackUrlBuilder]);

  return state;
};
