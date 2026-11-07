import { describe, expect, it } from "vitest";

import { isWebReplayRangeVerified } from "./web-replay-coverage";

const chunks = [0, 1, 2].map((chunkIndex) => ({
  chunkIndex,
  startElapsedMs: chunkIndex * 100,
  endElapsedMs: (chunkIndex + 1) * 100
}));
describe("Web App replay coverage", () => {
  it("keeps a verified frame visible across contiguous verified chunks", () => {
    expect(isWebReplayRangeVerified(chunks, new Set(), 50, 250)).toBe(true);
  });
  it("hides an old frame across a missing, failed or uncovered interval", () => {
    expect(isWebReplayRangeVerified([chunks[0], chunks[2]], new Set(), 50, 250)).toBe(false);
    expect(isWebReplayRangeVerified(chunks, new Set([1]), 50, 250)).toBe(false);
    expect(isWebReplayRangeVerified(chunks, new Set(), 50, 350)).toBe(false);
  });
  it("resumes at a verified frame after an earlier damaged interval", () => {
    expect(isWebReplayRangeVerified(chunks, new Set([0]), 220, 250)).toBe(true);
  });
});
