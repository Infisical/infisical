import { TPamPlaybackChunk } from "@app/hooks/api/pam/session-playback/types";

export const isWebReplayRangeVerified = (
  chunks: Pick<TPamPlaybackChunk, "chunkIndex" | "startElapsedMs" | "endElapsedMs">[],
  brokenIndices: Set<number>,
  fromMs: number,
  toMs: number
) => {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  let coveredUntil = fromMs;
  let previousIndex: number | undefined;
  for (const chunk of sorted.filter((entry) => entry.endElapsedMs >= fromMs)) {
    if (chunk.startElapsedMs > coveredUntil || brokenIndices.has(chunk.chunkIndex)) return false;
    if (previousIndex !== undefined && chunk.chunkIndex !== previousIndex + 1) return false;
    coveredUntil = Math.max(coveredUntil, chunk.endElapsedMs);
    if (coveredUntil >= toMs) return true;
    previousIndex = chunk.chunkIndex;
  }
  return false;
};
