import { describe, expect, test } from "vitest";

import { TAuditLogs } from "@app/db/schemas";

import { TAuditLogStreamOutboxRow } from "../audit-log-stream-outbox/audit-log-stream-outbox-types";
import { chunkAuditLogsByBatchLimit } from "./audit-log-stream-batching";
import { TLogStreamFactoryProviderBatchLimit } from "./audit-log-stream-types";

// The chunker only reads `.payload` from each row, so test fixtures use a
// minimal row stub. `padBytes` lets us drive the byte-cap branch deterministically.
const buildRow = (idx: number, padBytes = 0): TAuditLogStreamOutboxRow =>
  ({
    id: idx,
    payload: {
      id: `log-${idx.toString().padStart(6, "0")}`,
      eventMetadata: { pad: "x".repeat(padBytes) }
    } as unknown as TAuditLogs
  }) as TAuditLogStreamOutboxRow;

// A roomy limit used when we want chunks driven purely by count.
const COUNT_BOUND_LIMIT: TLogStreamFactoryProviderBatchLimit = { maxLogs: 4, maxBytes: 10 * 1024 * 1024 };
// A small byte cap that forces splits regardless of count.
const BYTE_BOUND_LIMIT: TLogStreamFactoryProviderBatchLimit = { maxLogs: 10_000, maxBytes: 1_024 };

describe("chunkAuditLogsByBatchLimit", () => {
  test("returns no chunks for an empty input", () => {
    expect(chunkAuditLogsByBatchLimit([], COUNT_BOUND_LIMIT)).toEqual([]);
  });

  test("returns a single chunk when both caps fit", () => {
    const rows = [buildRow(1), buildRow(2), buildRow(3)];
    const chunks = chunkAuditLogsByBatchLimit(rows, COUNT_BOUND_LIMIT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(rows);
  });

  test("respects the count cap", () => {
    const rows = Array.from({ length: COUNT_BOUND_LIMIT.maxLogs + 1 }, (_, i) => buildRow(i));

    const chunks = chunkAuditLogsByBatchLimit(rows, COUNT_BOUND_LIMIT);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(COUNT_BOUND_LIMIT.maxLogs);
    expect(chunks[1]).toHaveLength(1);
  });

  test("respects the byte cap", () => {
    // Two rows each just over half the byte cap → one chunk apiece.
    const padBytes = Math.floor(BYTE_BOUND_LIMIT.maxBytes / 2);
    const rows = [buildRow(1, padBytes), buildRow(2, padBytes)];

    const chunks = chunkAuditLogsByBatchLimit(rows, BYTE_BOUND_LIMIT);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
    for (const chunk of chunks) {
      const bytes = Buffer.byteLength(JSON.stringify(chunk[0].payload), "utf8");
      expect(bytes).toBeLessThanOrEqual(BYTE_BOUND_LIMIT.maxBytes);
    }
  });

  test("emits an oversized single row as its own singleton chunk", () => {
    const small = buildRow(1);
    const oversized = buildRow(2, BYTE_BOUND_LIMIT.maxBytes + 100);
    const trailing = buildRow(3);

    const chunks = chunkAuditLogsByBatchLimit([small, oversized, trailing], BYTE_BOUND_LIMIT);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([small]);
    expect(chunks[1]).toEqual([oversized]);
    expect(chunks[2]).toEqual([trailing]);
  });

  test("packs greedily — fills each chunk before opening the next", () => {
    const rows = Array.from({ length: COUNT_BOUND_LIMIT.maxLogs * 2 + 1 }, (_, i) => buildRow(i));

    const chunks = chunkAuditLogsByBatchLimit(rows, COUNT_BOUND_LIMIT);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(COUNT_BOUND_LIMIT.maxLogs);
    expect(chunks[1]).toHaveLength(COUNT_BOUND_LIMIT.maxLogs);
    expect(chunks[2]).toHaveLength(1);
    // No row dropped or duplicated.
    expect(chunks.flat()).toEqual(rows);
  });

  test("handles a mix of count- and byte-bounded packing", () => {
    // maxLogs=4 / maxBytes=1KB: a few medium-sized payloads partition by bytes
    // well before the count cap is reached.
    const limit: TLogStreamFactoryProviderBatchLimit = { maxLogs: 4, maxBytes: 1_024 };
    const padBytes = Math.floor(limit.maxBytes / 3);
    const rows = [buildRow(1, padBytes), buildRow(2, padBytes), buildRow(3, padBytes), buildRow(4, padBytes)];

    const chunks = chunkAuditLogsByBatchLimit(rows, limit);

    expect(chunks.flat()).toHaveLength(4);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      const bytes = chunk.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r.payload), "utf8"), 0);
      expect(bytes).toBeLessThanOrEqual(limit.maxBytes);
    }
  });
});
