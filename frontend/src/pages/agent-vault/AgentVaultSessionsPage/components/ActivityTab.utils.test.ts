import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { AgentVaultActivityDecision } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActivityRecord } from "@app/hooks/api/agentVault/types";

import { findRowShift } from "./ActivityTab.utils";

const record = (seq: number): TAgentVaultActivityRecord => ({
  ts: new Date(Date.UTC(2026, 8, 23, 10, 0, 0, seq)).toISOString(),
  seq,
  proxyId: "proxy-1",
  method: "GET",
  host: "api.github.com",
  port: "443",
  path: "/",
  status: 200,
  decision: AgentVaultActivityDecision.Passthrough,
  service: null,
  accessBundle: null
});

// Newest first, as the sheet shows them.
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
