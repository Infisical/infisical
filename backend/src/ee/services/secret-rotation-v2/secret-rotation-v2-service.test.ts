import { beforeEach, describe, expect, test, vi } from "vitest";

import { recordSecretRotationOutcomeMetric, recordSecretRotationStatusChangeMetric } from "@app/lib/telemetry/metrics";

import { SecretRotation, SecretRotationStatus } from "./secret-rotation-v2-enums";
import { secretRotationV2ServiceFactory } from "./secret-rotation-v2-service";
import { TSecretRotationV2Raw } from "./secret-rotation-v2-types";

const rotateCredentials = vi.fn<() => Promise<unknown>>();

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ isSmtpConfigured: false })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordSecretRotationOutcomeMetric: vi.fn(),
  recordSecretRotationStatusChangeMetric: vi.fn()
}));

vi.mock("@app/services/app-connection/app-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/app-connection-fns")>()),
  decryptAppConnection: vi.fn(async () => ({}))
}));

vi.mock("@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns")>()),
  decryptSecretRotationCredentials: vi.fn(async () => [{}, {}])
}));

vi.mock("./stripe-api-key/stripe-api-key-rotation-fns", () => ({
  stripeApiKeyRotationFactory: () => ({ rotateCredentials })
}));

const createService = ({ lockFails = false } = {}) => {
  const release = vi.fn(async () => undefined);
  const deps = {
    keyStore: {
      acquireLock: vi.fn(async () => {
        if (lockFails) throw new Error("locked");
        return { release };
      })
    },
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: () => ({ cipherTextBlob: Buffer.from("encrypted") })
      }))
    },
    secretRotationV2DAL: { updateById: vi.fn(async () => ({})) },
    auditLogService: { createAuditLog: vi.fn(async () => undefined) },
    secretV2BridgeDAL: { invalidateSecretCacheByProjectId: vi.fn(async () => undefined) },
    secretQueueService: { syncSecrets: vi.fn(async () => undefined) },
    telemetryService: { sendPostHogEvents: vi.fn(async () => undefined) },
    queueService: { queue: vi.fn(async () => undefined) }
  };

  return secretRotationV2ServiceFactory(deps as never);
};

const rotation = (rotationStatus: SecretRotationStatus) =>
  ({
    id: "rotation-1",
    name: "rotation",
    type: SecretRotation.StripeApiKey,
    rotationStatus,
    projectId: "project-1",
    folderId: "folder-1",
    activeIndex: 0,
    encryptedGeneratedCredentials: Buffer.from(""),
    rotateAtUtc: { hours: 0, minutes: 0 },
    parameters: {},
    secretsMapping: {},
    connection: { id: "connection-1", orgId: "org-1", app: "stripe" },
    folder: { id: "folder-1", path: "/" },
    environment: { id: "env-1", slug: "dev", name: "Development" }
  }) as unknown as TSecretRotationV2Raw;

const outcomeCalls = () => vi.mocked(recordSecretRotationOutcomeMetric).mock.calls.map(([params]) => params);
const statusChangeCalls = () => vi.mocked(recordSecretRotationStatusChangeMetric).mock.calls.map(([params]) => params);

describe("rotateGeneratedCredentials metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("reports a manual rotation as exhausted, since it is never retried", async () => {
    rotateCredentials.mockResolvedValueOnce({});
    const service = createService();

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isManualRotation: true });

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "success", attemptsExhausted: true }
    ]);
  });

  test("reports an intermediate failed attempt as not exhausted and does not flip the status", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const service = createService();

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: false })
    ).rejects.toThrow();

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "failure", attemptsExhausted: false }
    ]);
    expect(statusChangeCalls()).toEqual([]);
  });

  test("flips to failed when the final attempt fails after a previous success", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const service = createService();

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "failure", attemptsExhausted: true }
    ]);
    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.StripeApiKey, to: "failed" }]);
  });

  test("does not flip again when an already failed rotation fails", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const service = createService();

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Failed), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([]);
  });

  test("flips to healthy when a previously failed rotation succeeds", async () => {
    rotateCredentials.mockResolvedValueOnce({});
    const service = createService();

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Failed), { isFinalAttempt: false });

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "success", attemptsExhausted: false }
    ]);
    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.StripeApiKey, to: "healthy" }]);
  });

  test("does not flip to healthy when a healthy rotation succeeds", async () => {
    rotateCredentials.mockResolvedValueOnce({});
    const service = createService();

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success));

    expect(statusChangeCalls()).toEqual([]);
  });

  test("does not count lock contention as the rotation breaking", async () => {
    const service = createService({ lockFails: true });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "failure", attemptsExhausted: true }
    ]);
    expect(statusChangeCalls()).toEqual([]);
  });
});
