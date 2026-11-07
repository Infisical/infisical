import { describe, expect, it } from "vitest";

import { AgentVaultServiceType, AgentVaultSessionLogDecision } from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import {
  hasNativeSessionLogDetails,
  matchesSessionLogSearch,
  nativeSessionLogSections,
  nativeSessionLogSummary,
  sessionLogMethodLabel
} from "./SessionLogsPanel.utils";

const record = (
  overrides: Partial<TAgentVaultSessionLogRecord> = {}
): TAgentVaultSessionLogRecord => ({
  ts: "2026-11-07T10:00:00.000Z",
  seq: 1,
  proxyId: "proxy-1",
  method: "POSTGRES",
  host: "db.internal",
  port: "5432",
  path: "",
  status: 0,
  decision: AgentVaultSessionLogDecision.Brokered,
  service: "orders-db",
  accessBundle: "bundle-1",
  serviceType: AgentVaultServiceType.Postgres,
  ...overrides
});

describe("nativeSessionLogSummary", () => {
  it("uses what the agent ran, on one line", () => {
    expect(
      nativeSessionLogSummary(record({ native: { statement: "SELECT *\n  FROM orders" } }))
    ).toBe("SELECT * FROM orders");
  });

  it("falls back to the first line sent or returned rather than saying nothing was recorded", () => {
    expect(nativeSessionLogSummary(record({ native: { stdin: "\n  first input\nsecond" } }))).toBe(
      "first input"
    );
    expect(nativeSessionLogSummary(record({ native: { output: "\n\nline one\nline two" } }))).toBe(
      "line one"
    );
    expect(nativeSessionLogSummary(record({ native: { result: "SELECT 1" } }))).toBe("SELECT 1");
    expect(
      nativeSessionLogSummary(record({ native: { note: "Port forwarding isn't recorded." } }))
    ).toBe("Port forwarding isn't recorded.");
    expect(nativeSessionLogSummary(record({ native: {} }))).toBe("");
  });

  it("names an interactive shell before its output", () => {
    expect(nativeSessionLogSummary(record({ native: { shell: true, output: "$ ls" } }))).toBe(
      "Interactive shell"
    );
  });
});

describe("matchesSessionLogSearch", () => {
  const native = record({
    native: {
      command: "cat /etc/hosts",
      stdin: "piped value",
      result: "ERROR: permission denied for table users",
      output: "127.0.0.1 localhost",
      note: "Forwarded channel"
    }
  });

  it("searches the result, output, input and note of a native row", () => {
    ["permission denied", "localhost", "piped", "forwarded", "cat /etc"].forEach((term) =>
      expect(matchesSessionLogSearch(native, term)).toBe(true)
    );
    expect(matchesSessionLogSearch(native, "nothing like this")).toBe(false);
  });

  it("finds a native row by the type name the Method column shows", () => {
    expect(matchesSessionLogSearch(native, "PostgreSQL")).toBe(true);
  });
});

describe("sessionLogMethodLabel", () => {
  it("names the service type once instead of the upper-case method", () => {
    expect(sessionLogMethodLabel(record())).toBe("PostgreSQL");
    expect(sessionLogMethodLabel(record({ method: "MYSQL", serviceType: null, native: {} }))).toBe(
      "MySQL"
    );
    expect(
      sessionLogMethodLabel(
        record({ method: "GET", serviceType: AgentVaultServiceType.Http, native: undefined })
      )
    ).toBe("GET");
  });
});

describe("nativeSessionLogSections", () => {
  it("lists only what was recorded, in the order it happened, and flags a failed result", () => {
    expect(
      nativeSessionLogSections({
        statement: "DELETE FROM users",
        result: "ERROR: permission denied for table users",
        output: ""
      })
    ).toEqual([
      { label: "Statement", value: "DELETE FROM users" },
      { label: "Result", value: "ERROR: permission denied for table users", isError: true }
    ]);
    expect(nativeSessionLogSections({ command: "ls", stdin: "x", output: "y" })).toEqual([
      { label: "Command", value: "ls" },
      { label: "Input", value: "x" },
      { label: "Output", value: "y" }
    ]);
    expect(nativeSessionLogSections({ result: "NO_RESPONSE" })).toEqual([
      { label: "Result", value: "NO_RESPONSE", isError: true }
    ]);
    expect(nativeSessionLogSections({ result: "SELECT 42" })).toEqual([
      { label: "Result", value: "SELECT 42", isError: false }
    ]);
  });

  it("leaves a row with only a note, or nothing, unexpandable", () => {
    expect(hasNativeSessionLogDetails(undefined)).toBe(false);
    expect(hasNativeSessionLogDetails({ note: "Forwarded channel" })).toBe(false);
    expect(hasNativeSessionLogDetails({ shell: true })).toBe(false);
    expect(hasNativeSessionLogDetails({ shell: true, output: "$ ls" })).toBe(true);
  });
});
