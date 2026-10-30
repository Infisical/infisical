import { describe, expect, test, vi } from "vitest";

import { PkiSyncStatus } from "./pki-sync-enums";
import { HOST_COMMAND_TIMEOUT_MS, HostCommandKind, runHostCommand } from "./pki-sync-host-command-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const run = (execute: () => Promise<never>) =>
  runHostCommand({ kind: HostCommandKind.HealthCheck, syncId: "sync-1", execute });

describe("runHostCommand distinguishes a timeout from an unreachable host", () => {
  test("a deadline enforced outside this process still reports as a timeout", async () => {
    const timeoutMs = HOST_COMMAND_TIMEOUT_MS[HostCommandKind.HealthCheck];
    const result = await run(() => Promise.reject(new Error(`command timed out after ${timeoutMs / 1000}s`)));

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.exitCode).toBeUndefined();
    expect(result.timedOut).toBe(true);
  });

  test("the gateway's own RPC deadline reports as a timeout too", async () => {
    const result = await run(() => Promise.reject(new Error("SSH exec RPC timed out after 20000ms")));

    expect(result.timedOut).toBe(true);
  });

  test("an SSH connection timeout is unreachable, not a slow command", async () => {
    const result = await run(() =>
      Promise.reject(new Error("SSH Error: Connection timeout. Verify that the SSH server is reachable"))
    );

    expect(result.timedOut).toBe(false);
  });

  test("a fast transport failure is not a timeout, so the remedy stays connectivity", async () => {
    const result = await run(() =>
      Promise.reject(new Error("failed to dial target SSH server: dial tcp 10.0.0.1:22: connect: connection refused"))
    );

    expect(result.status).toBe(PkiSyncStatus.Failed);
    expect(result.timedOut).toBe(false);
  });
});
