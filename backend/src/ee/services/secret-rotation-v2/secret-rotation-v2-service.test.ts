import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { recordSecretRotationOutcomeMetric, recordSecretRotationStatusChangeMetric } from "@app/lib/telemetry/metrics";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { fnSecretBulkUpdate } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

import { SecretRotation, SecretRotationStatus } from "./secret-rotation-v2-enums";
import { SecretRotationInProgressError, secretRotationV2ServiceFactory } from "./secret-rotation-v2-service";
import { TSecretRotationV2Raw } from "./secret-rotation-v2-types";
import { UnixLinuxLocalAccountRotationMethod } from "./unix-linux-local-account-rotation/unix-linux-local-account-rotation-schemas";

type TRotationCallback = (newCredentials: unknown) => Promise<unknown>;
const rotateCredentials = vi.fn<(inactive: unknown, callback: TRotationCallback) => Promise<unknown>>();
// What a provider does on success: issue new credentials and hand them to the service to persist.
const runCallback = async (_inactive: unknown, callback: TRotationCallback) => callback({});

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

vi.mock("@app/services/secret-v2-bridge/secret-blind-index-fns", () => ({
  createSecretBlindIndexer: vi.fn(async () => ({ generateBlindIndexes: vi.fn(async () => []) }))
}));

vi.mock("@app/services/secret-v2-bridge/secret-v2-bridge-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/secret-v2-bridge/secret-v2-bridge-fns")>()),
  fnSecretBulkUpdate: vi.fn(async () => [])
}));

vi.mock("@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns")>()),
  decryptSecretRotationCredentials: vi.fn(async () => [{ username: "app", password: "old" }, {}]),
  encryptSecretRotationCredentials: vi.fn(async () => Buffer.from("encrypted")),
  expandSecretRotation: vi.fn(async (rotation: unknown) => rotation)
}));

vi.mock("./stripe-api-key/stripe-api-key-rotation-fns", () => ({
  stripeApiKeyRotationFactory: () => ({ rotateCredentials, getSecretsPayload: () => [] })
}));

vi.mock("./unix-linux-local-account-rotation/unix-linux-local-account-rotation-fns", () => ({
  unixLinuxLocalAccountRotationFactory: () => ({
    issueCredentials: async (callback: TRotationCallback) => callback({ username: "app", password: "reconciled" })
  })
}));

const rotation = (rotationStatus: SecretRotationStatus, type = SecretRotation.StripeApiKey) =>
  ({
    id: "rotation-1",
    name: "rotation",
    type,
    rotationStatus,
    projectId: "project-1",
    folderId: "folder-1",
    activeIndex: 0,
    encryptedGeneratedCredentials: Buffer.from(""),
    rotateAtUtc: { hours: 0, minutes: 0 },
    rotationInterval: 1,
    isAutoRotationEnabled: false,
    lastRotatedAt: new Date("2026-10-01T00:00:00.000Z"),
    parameters: { rotationMethod: UnixLinuxLocalAccountRotationMethod.LoginAsTarget },
    secretsMapping: { username: "APP_USER", password: "APP_PASS" },
    connection: {
      id: "connection-1",
      orgId: "org-1",
      app: type === SecretRotation.StripeApiKey ? "stripe" : "ssh"
    },
    folder: { id: "folder-1", path: "/" },
    environment: { id: "env-1", slug: "dev", name: "Development" }
  }) as unknown as TSecretRotationV2Raw;

const TX = { name: "rotation-transaction" };

const actor = {
  type: ActorType.USER,
  id: "user-1",
  orgId: "org-1",
  authMethod: AuthMethod.EMAIL,
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

// storedStatus is the rotation row in the database; the object passed to rotateGeneratedCredentials is what the
// job loaded, which can be older.
const createService = ({
  storedStatus,
  lockFails = false,
  type = SecretRotation.StripeApiKey
}: {
  storedStatus: SecretRotationStatus;
  lockFails?: boolean;
  type?: SecretRotation;
}) => {
  const stored = { rotationStatus: storedStatus };
  const release = vi.fn(async () => undefined);
  const deps = {
    keyStore: {
      getItem: vi.fn(async () => null),
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
    licenseService: { getPlan: vi.fn(async () => ({ secretRotation: true })) },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "manage", subject: "all" }])
      }))
    },
    secretValidationRuleService: { findConstraintsForGeneratedSecret: vi.fn(async () => ({ ruleNames: [] })) },
    secretRotationV2DAL: {
      findById: vi.fn(async () => rotation(stored.rotationStatus, type)),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(TX)),
      // A conditional UPDATE: only a row still matching the filter is changed and returned.
      update: vi.fn(async (filter: { rotationStatus?: string }, data: { rotationStatus: SecretRotationStatus }) => {
        if (filter.rotationStatus !== stored.rotationStatus) return [];
        Object.assign(stored, data);
        return [{ ...stored }];
      }),
      updateById: vi.fn(async (_id: string, data: Partial<typeof stored>) => ({
        ...rotation(stored.rotationStatus, type),
        ...Object.assign(stored, data)
      }))
    },
    auditLogService: { createAuditLog: vi.fn(async () => undefined) },
    secretV2BridgeDAL: { invalidateSecretCacheByProjectId: vi.fn(async () => undefined) },
    secretQueueService: { syncSecrets: vi.fn(async () => undefined) },
    telemetryService: { sendPostHogEvents: vi.fn(async () => undefined) },
    queueService: { queue: vi.fn(async () => undefined) }
  };

  return { service: secretRotationV2ServiceFactory(deps as never), stored, deps };
};

const outcomeCalls = () => vi.mocked(recordSecretRotationOutcomeMetric).mock.calls.map(([params]) => params);
const statusChangeCalls = () => vi.mocked(recordSecretRotationStatusChangeMetric).mock.calls.map(([params]) => params);

describe("rotateGeneratedCredentials metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("reports a manual rotation as exhausted, since it is never retried", async () => {
    rotateCredentials.mockImplementationOnce(runCallback);
    const { service } = createService({ storedStatus: SecretRotationStatus.Success });

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isManualRotation: true });

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "success", attemptsExhausted: true }
    ]);
  });

  test("reports an intermediate failed attempt as not exhausted and does not flip the status", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const { service, stored } = createService({ storedStatus: SecretRotationStatus.Success });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: false })
    ).rejects.toThrow();

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "failure", attemptsExhausted: false }
    ]);
    expect(statusChangeCalls()).toEqual([]);
    expect(stored.rotationStatus).toBe(SecretRotationStatus.Success);
  });

  test("flips to failed when the final attempt fails after a previous success", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const { service, stored } = createService({ storedStatus: SecretRotationStatus.Success });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "failure", attemptsExhausted: true }
    ]);
    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.StripeApiKey, newStatus: "failed" }]);
    expect(stored.rotationStatus).toBe(SecretRotationStatus.Failed);
  });

  test("writes the failed status and the run's fields in one transaction", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const { service, deps } = createService({ storedStatus: SecretRotationStatus.Success });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(deps.secretRotationV2DAL.update).toHaveBeenCalledWith(expect.anything(), expect.anything(), TX);
    expect(deps.secretRotationV2DAL.updateById).toHaveBeenCalledWith("rotation-1", expect.anything(), TX);
  });

  test("does not flip again when an already failed rotation fails", async () => {
    rotateCredentials.mockRejectedValueOnce(new Error("provider down"));
    const { service } = createService({ storedStatus: SecretRotationStatus.Failed });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Failed), { isFinalAttempt: true })
    ).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([]);
  });

  test("reports a breakage once when two runs loaded the same healthy rotation", async () => {
    rotateCredentials.mockRejectedValue(new Error("provider down"));
    const { service } = createService({ storedStatus: SecretRotationStatus.Success });
    const loadedBeforeEitherRan = rotation(SecretRotationStatus.Success);

    await expect(service.rotateGeneratedCredentials(loadedBeforeEitherRan, { isFinalAttempt: true })).rejects.toThrow();
    await expect(service.rotateGeneratedCredentials(loadedBeforeEitherRan, { isFinalAttempt: true })).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.StripeApiKey, newStatus: "failed" }]);
    rotateCredentials.mockReset();
  });

  test("flips to healthy when a previously failed rotation succeeds", async () => {
    rotateCredentials.mockImplementationOnce(runCallback);
    const { service, stored } = createService({ storedStatus: SecretRotationStatus.Failed });

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Failed), { isFinalAttempt: false });

    expect(outcomeCalls()).toEqual([
      { type: SecretRotation.StripeApiKey, outcome: "success", attemptsExhausted: false }
    ]);
    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.StripeApiKey, newStatus: "healthy" }]);
    expect(stored.rotationStatus).toBe(SecretRotationStatus.Success);
  });

  test("does not flip to healthy when a healthy rotation succeeds", async () => {
    rotateCredentials.mockImplementationOnce(runCallback);
    const { service } = createService({ storedStatus: SecretRotationStatus.Success });

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success));

    expect(statusChangeCalls()).toEqual([]);
  });
});

// Rotation and reconcile can run at once on the same rotation (reconcile does not take the rotation lock), so both must
// lock the secrets before the rotation row or they can deadlock each other.
describe("row lock order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const expectSecretsWrittenBeforeRotationRow = (deps: ReturnType<typeof createService>["deps"]) => {
    const [secretsWrite] = vi.mocked(fnSecretBulkUpdate).mock.invocationCallOrder;
    const [rotationRowWrite] = deps.secretRotationV2DAL.update.mock.invocationCallOrder;
    expect(secretsWrite).toBeLessThan(rotationRowWrite);
  };

  test("a rotation writes the secrets before the rotation row", async () => {
    rotateCredentials.mockImplementationOnce(runCallback);
    const { service, deps } = createService({ storedStatus: SecretRotationStatus.Failed });

    await service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Failed));

    expectSecretsWrittenBeforeRotationRow(deps);
  });

  test("a reconcile writes the secrets before the rotation row", async () => {
    const { service, deps } = createService({
      storedStatus: SecretRotationStatus.Failed,
      type: SecretRotation.UnixLinuxLocalAccount
    });

    await service.reconcileLocalAccountRotation(
      { rotationId: "rotation-1", type: SecretRotation.UnixLinuxLocalAccount },
      actor as never
    );

    expectSecretsWrittenBeforeRotationRow(deps);
  });
});

describe("rotation lock contention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("skips a run that cannot take the lock: no outcome, status write, notification or status change", async () => {
    const { service, stored, deps } = createService({ storedStatus: SecretRotationStatus.Success, lockFails: true });

    await expect(
      service.rotateGeneratedCredentials(rotation(SecretRotationStatus.Success), {
        isFinalAttempt: true,
        shouldSendNotification: true
      })
    ).rejects.toBeInstanceOf(SecretRotationInProgressError);

    expect(outcomeCalls()).toEqual([]);
    expect(statusChangeCalls()).toEqual([]);
    expect(stored.rotationStatus).toBe(SecretRotationStatus.Success);
    expect(deps.secretRotationV2DAL.updateById).not.toHaveBeenCalled();
    expect(deps.queueService.queue).not.toHaveBeenCalled();
    expect(deps.telemetryService.sendPostHogEvents).not.toHaveBeenCalled();
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
  });

  test("answers a manual rotation that loses the lock race with the in-progress error, not a server error", async () => {
    const { service } = createService({ storedStatus: SecretRotationStatus.Success, lockFails: true });

    await expect(
      service.rotateSecretRotation(
        { rotationId: "rotation-1", type: SecretRotation.StripeApiKey, auditLogInfo: {} as never },
        actor as never
      )
    ).rejects.toBeInstanceOf(SecretRotationInProgressError);
  });
});

describe("reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("records the recovery when it fixes a failed local-account rotation", async () => {
    const { service, stored } = createService({
      storedStatus: SecretRotationStatus.Failed,
      type: SecretRotation.UnixLinuxLocalAccount
    });

    await service.reconcileLocalAccountRotation(
      { rotationId: "rotation-1", type: SecretRotation.UnixLinuxLocalAccount },
      actor as never
    );

    expect(stored.rotationStatus).toBe(SecretRotationStatus.Success);
    expect(statusChangeCalls()).toEqual([{ type: SecretRotation.UnixLinuxLocalAccount, newStatus: "healthy" }]);
  });

  test("records nothing when it reconciles a rotation that was not failing", async () => {
    const { service } = createService({
      storedStatus: SecretRotationStatus.Success,
      type: SecretRotation.UnixLinuxLocalAccount
    });

    await service.reconcileLocalAccountRotation(
      { rotationId: "rotation-1", type: SecretRotation.UnixLinuxLocalAccount },
      actor as never
    );

    expect(statusChangeCalls()).toEqual([]);
  });
});
