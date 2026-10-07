import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { AgentVaultSessionLogDecision } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import {
  findRowShift,
  groupSessionLogGaps,
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

const rows = (...seqs: number[]) => seqs.map(record);

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

describe("groupSessionLogGaps", () => {
  const gap = (reason: "gcm" | "missing") => ({ reason, firstSeenAt: null });

  it("counts the batches for each reason, in the order the reasons first appear", () => {
    assert.deepEqual(groupSessionLogGaps([gap("gcm"), gap("gcm"), gap("missing"), gap("gcm")]), [
      { reason: "gcm", chunkCount: 3 },
      { reason: "missing", chunkCount: 1 }
    ]);
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
