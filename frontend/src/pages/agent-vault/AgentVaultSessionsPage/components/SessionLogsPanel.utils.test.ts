import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { AgentVaultSessionLogDecision } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import {
  chunkIdTime,
  findRowShift,
  groupSessionLogGaps,
  interleaveSessionLogDrops,
  matchesSessionLogSearch
} from "./SessionLogsPanel.utils";

const record = (seq: number): TAgentVaultSessionLogRecord => ({
  ts: new Date(Date.UTC(2026, 8, 23, 10, 0, 0, seq)).toISOString(),
  seq,
  proxyId: "proxy-1",
  method: "GET",
  host: "api.github.com",
  port: "443",
  path: "/",
  status: 200,
  decision: AgentVaultSessionLogDecision.Passthrough,
  service: null,
  accessBundle: null
});

const rows = (...seqs: number[]) =>
  seqs.map((seq) => ({ kind: "record" as const, record: record(seq) }));

describe("findRowShift", () => {
  it("moves the row down by however many rows arrived at the top", () => {
    assert.equal(findRowShift(rows(5, 4, 3, 2, 1), rows(8, 7, 6, 5, 4, 3, 2, 1), 2), 3);
  });

  it("moves the row down when a late chunk slots rows in above it, not only at the top", () => {
    assert.equal(findRowShift(rows(9, 5, 4, 1), rows(9, 7, 6, 5, 4, 1), 2), 2);
  });

  it("leaves the row where it is when rows land below it", () => {
    assert.equal(findRowShift(rows(9, 8, 5), rows(9, 8, 5, 3, 2), 1), 0);
  });

  it("moves the row up when rows above it are no longer shown", () => {
    assert.equal(findRowShift(rows(9, 8, 7, 6), rows(9, 6), 3), -2);
  });

  it("has nothing to hold when the row itself is no longer shown", () => {
    assert.equal(findRowShift(rows(9, 8, 7), rows(9, 7), 1), null);
  });

  it("has nothing to hold past the end of what was shown", () => {
    assert.equal(findRowShift(rows(9, 8), rows(10, 9, 8), 5), null);
  });
});

describe("chunkIdTime", () => {
  it("reads the time from the example UUIDv7 in RFC 9562", () => {
    assert.equal(
      chunkIdTime("017f22e2-79b0-7cc3-98c4-dc0c0c07398f").toISOString(),
      "2022-02-22T19:22:22.000Z"
    );
  });
});

describe("groupSessionLogGaps", () => {
  const gap = (reason: "gcm" | "missing", recordCount: number, chunkId: string) => ({
    chunkId,
    proxyId: "proxy-1",
    proxyName: "proxy",
    startedAt: "2026-09-24T13:17:00.000Z",
    reason,
    recordCount
  });

  it("adds up the requests for each reason, in the order the reasons first appear", () => {
    assert.deepEqual(
      groupSessionLogGaps([
        gap("gcm", 10, "a"),
        gap("gcm", 11, "b"),
        gap("missing", 3, "c"),
        gap("gcm", 21, "d")
      ]),
      [
        { reason: "gcm", recordCount: 42 },
        { reason: "missing", recordCount: 3 }
      ]
    );
  });
});

describe("matchesSessionLogSearch", () => {
  const repoRequest = { ...record(1), path: "/repos/infisical/cli" };

  it("matches a host and path pasted together", () => {
    assert.equal(matchesSessionLogSearch(repoRequest, "api.github.com/repos/infisical"), true);
  });

  it("ignores the scheme of a pasted URL", () => {
    assert.equal(matchesSessionLogSearch(repoRequest, "https://api.github.com/repos"), true);
    assert.equal(matchesSessionLogSearch(repoRequest, "HTTP://api.github.com"), true);
  });

  it("matches a host with its port", () => {
    assert.equal(matchesSessionLogSearch(repoRequest, "api.github.com:443/repos"), true);
    assert.equal(matchesSessionLogSearch(repoRequest, "api.github.com:8443/repos"), false);
  });

  it("ignores the query string and fragment of a pasted URL", () => {
    assert.equal(
      matchesSessionLogSearch(repoRequest, "https://api.github.com/repos/infisical/cli?page=2"),
      true
    );
    assert.equal(matchesSessionLogSearch(repoRequest, "api.github.com/repos#readme"), true);
  });

  it("matches everything when only a scheme is typed", () => {
    assert.equal(matchesSessionLogSearch(repoRequest, "https://"), true);
  });

  it("does not match a path on a different host", () => {
    assert.equal(matchesSessionLogSearch(repoRequest, "gitlab.com/repos"), false);
  });
});

describe("interleaveSessionLogDrops", () => {
  const drop = (chunkId: string, beforeSeq: number, droppedCount: number) => ({
    chunkId,
    proxyId: "proxy-1",
    startedAt: record(beforeSeq).ts,
    droppedCount
  });
  const shape = (seqs: number[], drops: ReturnType<typeof drop>[]) =>
    interleaveSessionLogDrops(seqs.map(record), drops).map((row) =>
      row.kind === "record" ? row.record.seq : `-${row.droppedCount}`
    );

  it("puts a chunk's drops right under its oldest record", () => {
    assert.deepEqual(shape([9, 8, 5, 4], [drop("b", 8, 12)]), [9, 8, "-12", 5, 4]);
  });

  it("merges drops that end up side by side into one row", () => {
    assert.deepEqual(shape([9, 2], [drop("b", 8, 12), drop("a", 5, 3)]), [9, "-15", 2]);
  });

  it("never shows two drop rows next to each other, wherever the drops land", () => {
    const drops = [
      drop("f", 20, 1),
      drop("e", 19, 2),
      drop("d", 9, 4),
      drop("c", 9, 8),
      drop("b", 2, 16),
      drop("a", 1, 32)
    ];
    const result = interleaveSessionLogDrops([9, 5, 3].map(record), drops);
    result.forEach((row, index) => {
      if (index > 0) assert.ok(!(row.kind === "drop" && result[index - 1].kind === "drop"));
    });
    assert.deepEqual(shape([9, 5, 3], drops), ["-3", 9, "-12", 5, 3, "-48"]);
  });

  it("keeps drops older than every shown record at the bottom", () => {
    assert.deepEqual(shape([9, 8], [drop("a", 3, 7)]), [9, 8, "-7"]);
  });
});
