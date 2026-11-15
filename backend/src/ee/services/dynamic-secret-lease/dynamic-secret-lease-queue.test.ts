import { beforeEach, describe, expect, test, vi } from "vitest";

import { logger } from "@app/lib/logger";
import {
  recordDynamicSecretOrphanedLeaseMetric,
  recordDynamicSecretRevocationOutcomeMetric,
  recordDynamicSecretStatusChangeMetric
} from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName } from "@app/queue";

import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";
import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { dynamicSecretLeaseQueueServiceFactory } from "./dynamic-secret-lease-queue";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ isDevelopmentMode: false })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordDynamicSecretOrphanedLeaseMetric: vi.fn(),
  recordDynamicSecretRevocationOutcomeMetric: vi.fn(),
  recordDynamicSecretStatusChangeMetric: vi.fn()
}));

const PROVIDER = DynamicSecretProviders.SqlDatabase;
const CONFIG_ID = "dynamic-secret-1";
const MAX_ATTEMPTS = 3;

const dynamicSecretCfg = {
  id: CONFIG_ID,
  type: PROVIDER,
  folderId: "folder-1",
  encryptedInput: Buffer.from("{}"),
  status: DynamicSecretStatus.Deleting,
  revocationFailing: false
};

const lease = (id: string) => ({
  id,
  dynamicSecretId: CONFIG_ID,
  externalEntityId: `entity-${id}`,
  config: {},
  encryptedLeaseData: null
});

type THandler = (job: unknown) => Promise<void>;

// staleFlag: the revocationFailing value every lease load returns, standing in for a snapshot taken before another
// lease of the same config flipped the row.
const createHarness = ({ staleFlag }: { staleFlag?: boolean } = {}) => {
  const handlers = new Map<string, THandler>();
  const queueService = {
    start: vi.fn((name: string, fn: THandler) => {
      handlers.set(name, fn);
    }),
    queue: vi.fn(async () => undefined),
    stopJobById: vi.fn<(queue: string, jobId: string) => Promise<void>>(async () => undefined)
  };

  const cfg = { ...dynamicSecretCfg };
  const leases = new Map<string, ReturnType<typeof lease>>();
  const dynamicSecretLeaseDAL = {
    findById: vi.fn(async (id: string) => {
      const found = leases.get(id);
      if (!found) return undefined;
      return { ...found, dynamicSecret: { ...cfg, revocationFailing: staleFlag ?? cfg.revocationFailing } };
    }),
    deleteById: vi.fn(async (id: string) => {
      leases.delete(id);
    }),
    find: vi.fn(async () => [...leases.values()]),
    updateById: vi.fn(async () => ({}))
  };
  const dynamicSecretDAL = {
    findById: vi.fn(async () => cfg),
    deleteById: vi.fn(async () => cfg),
    updateById: vi.fn(async (_id: string, data: Partial<typeof cfg>) => Object.assign(cfg, data)),
    // A conditional UPDATE: only a row still matching the filter is changed and returned.
    update: vi.fn(async (filter: Partial<typeof cfg>, data: Partial<typeof cfg>) => {
      const matches = Object.entries(filter).every(([key, value]) => cfg[key as keyof typeof cfg] === value);
      return matches ? [Object.assign(cfg, data)] : [];
    })
  };
  const revoke = vi.fn<(inputs: unknown, entityId: string) => Promise<{ entityId: string }>>(
    async (_inputs, entityId) => ({ entityId })
  );
  dynamicSecretLeaseQueueServiceFactory({
    queueService: queueService as never,
    dynamicSecretLeaseDAL: dynamicSecretLeaseDAL as never,
    dynamicSecretDAL: dynamicSecretDAL as never,
    dynamicSecretProviders: { [PROVIDER]: { revoke } } as never,
    folderDAL: { findById: vi.fn(async () => ({ id: "folder-1", projectId: "project-1" })) } as never,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({ decryptor: () => Buffer.from("{}") }))
    } as never,
    smtpService: {} as never,
    userDAL: {} as never,
    identityDAL: {} as never,
    projectMembershipDAL: {} as never,
    projectDAL: {} as never
  });

  const run = (job: { name: string; id: string; data: unknown; attempt?: number; attempts?: number }) =>
    handlers.get(QueueName.DynamicSecretRevocation)!({
      name: job.name,
      id: job.id,
      data: job.data,
      attemptsMade: (job.attempt ?? 1) - 1,
      opts: { attempts: job.attempts ?? MAX_ATTEMPTS }
    });

  const runScheduled = (leaseId: string, attempt = 1) =>
    run({
      name: QueueJobs.DynamicSecretRevocation,
      id: leaseId,
      data: { leaseId, dynamicSecretId: CONFIG_ID },
      attempt
    });

  const runRetry = (leaseId: string, attempt = 1) =>
    run({
      name: QueueJobs.DynamicSecretRevocation,
      id: `${leaseId}-retry`,
      data: { leaseId, dynamicSecretId: CONFIG_ID, isRetry: true },
      attempt
    });

  const runPruning = (attempt = 1) =>
    run({
      name: QueueJobs.DynamicSecretPruning,
      id: `dynamic-secret-lease-pruning-${CONFIG_ID}`,
      data: { dynamicSecretCfgId: CONFIG_ID },
      attempt
    });

  const addLease = (id: string) => leases.set(id, lease(id));

  return {
    queueService,
    revoke,
    cfg,
    dynamicSecretDAL,
    dynamicSecretLeaseDAL,
    addLease,
    runScheduled,
    runRetry,
    runPruning
  };
};

const outcomeCalls = () => vi.mocked(recordDynamicSecretRevocationOutcomeMetric).mock.calls.map(([params]) => params);
const statusChangeCalls = () => vi.mocked(recordDynamicSecretStatusChangeMetric).mock.calls.map(([params]) => params);
const orphanedCalls = () => vi.mocked(recordDynamicSecretOrphanedLeaseMetric).mock.calls.map(([params]) => params);
const retryQueued = (queue: ReturnType<typeof createHarness>["queueService"]["queue"]) =>
  queue.mock.calls.filter((call) => (call as unknown[])[1] === QueueJobs.DynamicSecretRevocation);

describe("dynamic secret lease revocation metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scheduled revocation", () => {
    test("records one success and no status change for a healthy config", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");

      await harness.runScheduled("lease-1");

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "scheduled", outcome: "success", attemptsExhausted: false }
      ]);
      expect(statusChangeCalls()).toEqual([]);
    });

    test("records exactly one failure per lease, on the final scheduled attempt", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.revoke.mockRejectedValue(new Error("connection refused"));

      await expect(harness.runScheduled("lease-1", 1)).rejects.toThrow("connection refused");
      await expect(harness.runScheduled("lease-1", 2)).rejects.toThrow("connection refused");
      expect(outcomeCalls()).toEqual([]);
      // Handing off before the last attempt would let the retry job race the scheduled retries.
      expect(retryQueued(harness.queueService.queue)).toHaveLength(0);

      await expect(harness.runScheduled("lease-1", 3)).rejects.toThrow("connection refused");
      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "scheduled", outcome: "failure", attemptsExhausted: true }
      ]);
      expect(retryQueued(harness.queueService.queue)).toHaveLength(1);
    });

    test("records the success of a later scheduled attempt as the lease's only outcome", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.revoke.mockRejectedValueOnce(new Error("timeout"));

      await expect(harness.runScheduled("lease-1", 1)).rejects.toThrow("timeout");
      await harness.runScheduled("lease-1", 2);

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "scheduled", outcome: "success", attemptsExhausted: false }
      ]);
    });

    test("flips to failed on a config's first failed lease and not on the next", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.revoke.mockRejectedValue(new Error("connection refused"));

      await expect(harness.runScheduled("lease-1", MAX_ATTEMPTS)).rejects.toThrow();
      await expect(harness.runScheduled("lease-2", MAX_ATTEMPTS)).rejects.toThrow();

      expect(statusChangeCalls()).toEqual([{ provider: PROVIDER, newStatus: "failed" }]);
      expect(harness.cfg.revocationFailing).toBe(true);
    });

    test("flips to healthy once when a failing config revokes again", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.addLease("lease-3");
      harness.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await expect(harness.runScheduled("lease-1", MAX_ATTEMPTS)).rejects.toThrow();
      await harness.runScheduled("lease-2");
      await harness.runScheduled("lease-3");

      expect(statusChangeCalls()).toEqual([
        { provider: PROVIDER, newStatus: "failed" },
        { provider: PROVIDER, newStatus: "healthy" }
      ]);
      expect(harness.cfg.revocationFailing).toBe(false);
    });

    test("does not let a failed flag update fail or change the revocation", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.dynamicSecretDAL.update.mockRejectedValue(new Error("db pool timeout"));
      harness.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await expect(harness.runScheduled("lease-1", MAX_ATTEMPTS)).rejects.toThrow("connection refused");
      expect(retryQueued(harness.queueService.queue)).toHaveLength(1);

      harness.cfg.revocationFailing = true;
      await expect(harness.runScheduled("lease-2")).resolves.toBeUndefined();

      expect(statusChangeCalls()).toEqual([]);
      expect(outcomeCalls().map(({ outcome }) => outcome)).toEqual(["failure", "success"]);
      expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(2);
    });

    test("reports a flip once even when every lease loaded the config before it flipped", async () => {
      const harness = createHarness({ staleFlag: false });
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.revoke.mockRejectedValue(new Error("connection refused"));

      await expect(harness.runScheduled("lease-1", MAX_ATTEMPTS)).rejects.toThrow();
      await expect(harness.runScheduled("lease-2", MAX_ATTEMPTS)).rejects.toThrow();

      expect(statusChangeCalls()).toEqual([{ provider: PROVIDER, newStatus: "failed" }]);
    });

    test("picks up a recovery a stale load skipped on the config's next revocation", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.cfg.revocationFailing = true;

      const stale = createHarness({ staleFlag: false });
      stale.addLease("lease-1");
      stale.cfg.revocationFailing = true;
      await stale.runScheduled("lease-1");
      expect(statusChangeCalls()).toEqual([]);
      expect(stale.cfg.revocationFailing).toBe(true);

      await harness.runScheduled("lease-2");
      expect(statusChangeCalls()).toEqual([{ provider: PROVIDER, newStatus: "healthy" }]);
    });

    test("hands off to the retry queue even when marking the lease failed throws", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.revoke.mockRejectedValue(new Error("connection refused"));
      harness.dynamicSecretLeaseDAL.updateById.mockRejectedValue(new Error("db pool timeout"));

      await expect(harness.runScheduled("lease-1", MAX_ATTEMPTS)).rejects.toThrow("connection refused");

      expect(retryQueued(harness.queueService.queue)).toHaveLength(1);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ message: "db pool timeout" }),
        expect.stringContaining("lease-1")
      );
    });

    test("records nothing when the lease no longer exists", async () => {
      const harness = createHarness();

      await harness.runScheduled("missing-lease");

      expect(outcomeCalls()).toEqual([]);
      expect(statusChangeCalls()).toEqual([]);
    });
  });

  describe("retry revocation", () => {
    test("clears a failing config's flag and records the recovery when a retry succeeds", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.cfg.revocationFailing = true;

      await harness.runRetry("lease-1", 2);

      expect(harness.cfg.revocationFailing).toBe(false);
      expect(statusChangeCalls()).toEqual([{ provider: PROVIDER, newStatus: "healthy" }]);
    });

    test("records every attempt, exhausted only on the last, and orphans the lease there", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.revoke.mockRejectedValue(new Error("connection refused"));

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await expect(harness.runRetry("lease-1", attempt)).rejects.toThrow();
      }

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "retry", outcome: "failure", attemptsExhausted: false },
        { provider: PROVIDER, trigger: "retry", outcome: "failure", attemptsExhausted: false },
        { provider: PROVIDER, trigger: "retry", outcome: "failure", attemptsExhausted: true }
      ]);
      expect(orphanedCalls()).toEqual([{ provider: PROVIDER }]);
      expect(statusChangeCalls()).toEqual([]);
    });

    test("still orphans the lease and emails admins when marking the lease failed throws", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.revoke.mockRejectedValue(new Error("connection refused"));
      harness.dynamicSecretLeaseDAL.updateById.mockRejectedValue(new Error("db pool timeout"));

      await expect(harness.runRetry("lease-1", MAX_ATTEMPTS)).rejects.toThrow("connection refused");

      expect(orphanedCalls()).toEqual([{ provider: PROVIDER }]);
      expect(
        harness.queueService.queue.mock.calls.filter(
          (call) => (call as unknown[])[1] === QueueJobs.DynamicSecretLeaseRevocationFailedEmail
        )
      ).toHaveLength(1);
    });
  });

  describe("pruning", () => {
    test("records each lease once and orphans only the ones left unrevoked", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.addLease("lease-3");
      harness.revoke.mockImplementation(async (_inputs, entityId) => {
        if (entityId === "entity-lease-2") throw new Error("permission denied");
        return { entityId };
      });

      await expect(harness.runPruning(1)).rejects.toThrow("permission denied");
      // The config is now FailedDeletion, so BullMQ's remaining attempts return without revoking.
      await harness.runPruning(2);
      await harness.runPruning(3);

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "pruning", outcome: "success", attemptsExhausted: true },
        { provider: PROVIDER, trigger: "pruning", outcome: "failure", attemptsExhausted: true },
        { provider: PROVIDER, trigger: "pruning", outcome: "success", attemptsExhausted: true }
      ]);
      expect(orphanedCalls()).toEqual([{ provider: PROVIDER, count: 1 }]);
      expect(harness.revoke).toHaveBeenCalledTimes(3);
    });

    test("still revokes and counts every lease when cancelling a scheduled job fails partway", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");
      harness.queueService.stopJobById.mockImplementation(async (_queue: string, jobId: string) => {
        if (jobId === "lease-2") throw new Error("redis timeout");
      });
      harness.revoke.mockImplementation(async (_inputs, entityId) => {
        if (entityId === "entity-lease-1") throw new Error("permission denied");
        return { entityId };
      });

      await expect(harness.runPruning(1)).rejects.toThrow("permission denied");

      expect(harness.revoke).toHaveBeenCalledTimes(2);
      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "pruning", outcome: "failure", attemptsExhausted: true },
        { provider: PROVIDER, trigger: "pruning", outcome: "success", attemptsExhausted: true }
      ]);
      expect(orphanedCalls()).toEqual([{ provider: PROVIDER, count: 1 }]);
    });

    test("records a success per lease when every revoke succeeds", async () => {
      const harness = createHarness();
      harness.addLease("lease-1");
      harness.addLease("lease-2");

      await harness.runPruning(1);

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "pruning", outcome: "success", attemptsExhausted: false },
        { provider: PROVIDER, trigger: "pruning", outcome: "success", attemptsExhausted: false }
      ]);
      expect(orphanedCalls()).toEqual([]);
    });
  });
});
