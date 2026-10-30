import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { logger } from "@app/lib/logger";
import { RunMode } from "@app/lib/types";

import { workerHeartbeatFactory } from "./worker-heartbeat";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const makeFactory = (keyStore = inMemoryKeyStore()) => ({
  keyStore,
  ...workerHeartbeatFactory({
    keyStore,
    reportIntervalMs: 100,
    monitorIntervalMs: 100,
    monitorInitialDelayMs: 50
  })
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(logger.error).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("worker heartbeat", () => {
  test("a reporting worker shows up as an active instance", async () => {
    const worker = makeFactory();
    worker.startReporting(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(0);

    expect(await worker.getActiveInstanceIds(RunMode.GeneralWorkers)).toHaveLength(1);

    await worker.stop();
  });

  test("stop clears the instance so a graceful shutdown is visible immediately", async () => {
    const worker = makeFactory();
    worker.startReporting(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(0);

    await worker.stop();

    expect(await worker.getActiveInstanceIds(RunMode.GeneralWorkers)).toEqual([]);
  });

  test("each reporting pod is counted separately", async () => {
    const keyStore = inMemoryKeyStore();
    const workerA = makeFactory(keyStore);
    const workerB = makeFactory(keyStore);
    workerA.startReporting(RunMode.GeneralWorkers);
    workerB.startReporting(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(0);

    expect(await workerA.getActiveInstanceIds(RunMode.GeneralWorkers)).toHaveLength(2);

    await workerA.stop();
    await workerB.stop();
  });

  test("monitoring logs an error when no worker reports", async () => {
    const api = makeFactory();
    api.startMonitoring(RunMode.GeneralWorkers);

    await vi.advanceTimersByTimeAsync(50);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error).mock.calls[0][0]).toContain('no "general-workers" instances detected');

    await api.stop();
  });

  test("monitoring waits out the initial delay before its first check", async () => {
    const api = makeFactory();
    api.startMonitoring(RunMode.GeneralWorkers);

    await vi.advanceTimersByTimeAsync(49);

    expect(logger.error).not.toHaveBeenCalled();

    await api.stop();
  });

  test("monitoring keeps quiet while a worker reports, and complains once it stops", async () => {
    const keyStore = inMemoryKeyStore();
    const api = makeFactory(keyStore);
    const worker = makeFactory(keyStore);

    worker.startReporting(RunMode.GeneralWorkers);
    api.startMonitoring(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(250);

    expect(logger.error).not.toHaveBeenCalled();

    await worker.stop();
    await vi.advanceTimersByTimeAsync(100);

    expect(logger.error).toHaveBeenCalled();

    await api.stop();
  });

  test("a worker fleet does not mask a different missing fleet", async () => {
    const keyStore = inMemoryKeyStore();
    const api = makeFactory(keyStore);
    const worker = makeFactory(keyStore);

    worker.startReporting(RunMode.SecretScanning);
    api.startMonitoring(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(50);

    expect(vi.mocked(logger.error).mock.calls[0][0]).toContain('no "general-workers" instances detected');

    await worker.stop();
    await api.stop();
  });

  test("a crashed worker's stale entry stops counting once its deadline passes", async () => {
    const keyStore = inMemoryKeyStore();
    const worker = makeFactory(keyStore);
    worker.startReporting(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(0);
    // The pod is gone: its timer never fires again and nothing removes the entry.
    await worker.stop();
    await keyStore.setIndexedItemWithExpiry({
      indexKey: "worker-heartbeat:{general-workers}",
      member: "crashed-pod",
      itemKey: "worker-heartbeat:{general-workers}:crashed-pod",
      value: "{}",
      expiryInSeconds: 300,
      indexed: true
    });

    expect(await worker.getActiveInstanceIds(RunMode.GeneralWorkers)).toEqual(["crashed-pod"]);

    vi.setSystemTime(Date.now() + 301_000);

    expect(await worker.getActiveInstanceIds(RunMode.GeneralWorkers)).toEqual([]);
  });

  test("a failing keystore is logged and does not throw out of the timer", async () => {
    const keyStore = inMemoryKeyStore();
    vi.spyOn(keyStore, "setIndexedItemWithExpiry").mockRejectedValue(new Error("redis down"));
    const worker = makeFactory(keyStore);

    worker.startReporting(RunMode.GeneralWorkers);
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledTimes(1);

    await worker.stop();
  });
});
