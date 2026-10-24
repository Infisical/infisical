import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  recordDynamicSecretRevocationOutcomeMetric,
  recordDynamicSecretUnrecordedCredentialMetric
} from "@app/lib/telemetry/metrics";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { dynamicSecretLeaseServiceFactory } from "./dynamic-secret-lease-service";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ MAX_LEASE_LIMIT: 100 })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordDynamicSecretRevocationOutcomeMetric: vi.fn(),
  recordDynamicSecretUnrecordedCredentialMetric: vi.fn()
}));

const PROVIDER = DynamicSecretProviders.SqlDatabase;

const dynamicSecretCfg = {
  id: "dynamic-secret-1",
  type: PROVIDER,
  folderId: "folder-1",
  encryptedInput: Buffer.from("{}"),
  defaultTTL: "1h",
  maxTTL: null,
  usernameTemplate: null,
  metadata: []
};

const createService = () => {
  const provider = {
    create: vi.fn(async () => ({ entityId: "entity-1", data: {} })),
    revoke: vi.fn(async () => ({ entityId: "entity-1" }))
  };
  const dynamicSecretLeaseDAL = {
    countLeasesForDynamicSecret: vi.fn(async () => 0),
    create: vi.fn(async () => ({ id: "lease-1" })),
    findById: vi.fn(async () => ({
      id: "lease-1",
      dynamicSecretId: dynamicSecretCfg.id,
      externalEntityId: "entity-1",
      config: {},
      encryptedLeaseData: null,
      dynamicSecret: dynamicSecretCfg
    })),
    updateById: vi.fn(async () => ({})),
    deleteById: vi.fn(async () => ({}))
  };

  const service = dynamicSecretLeaseServiceFactory({
    dynamicSecretLeaseDAL: dynamicSecretLeaseDAL as never,
    dynamicSecretDAL: { findOne: vi.fn(async () => dynamicSecretCfg) } as never,
    dynamicSecretProviders: { [PROVIDER]: provider } as never,
    dynamicSecretQueueService: {
      setLeaseRevocation: vi.fn(async () => undefined),
      unsetLeaseRevocation: vi.fn(async () => undefined),
      queueFailedRevocation: vi.fn(async () => undefined)
    } as never,
    licenseService: { getPlan: vi.fn(async () => ({ dynamicSecret: true })) } as never,
    folderDAL: { findBySecretPath: vi.fn(async () => ({ id: "folder-1", envId: "env-1" })) } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "manage", subject: "all" }])
      }))
    } as never,
    projectDAL: { findProjectBySlug: vi.fn(async () => ({ id: "project-1" })) } as never,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: () => ({ cipherTextBlob: Buffer.from("") }),
        decryptor: () => Buffer.from("{}")
      }))
    } as never,
    userDAL: { findById: vi.fn(async () => undefined) } as never,
    identityDAL: { findById: vi.fn(async () => undefined) } as never,
    secretValidationRuleService: { findConstraintsForGeneratedSecret: vi.fn(async () => ({ ruleNames: [] })) } as never
  });

  return { service, provider, dynamicSecretLeaseDAL };
};

const actor = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: AuthMethod.EMAIL,
  projectSlug: "project",
  environmentSlug: "dev",
  path: "/"
};

const outcomeCalls = () => vi.mocked(recordDynamicSecretRevocationOutcomeMetric).mock.calls.map(([params]) => params);

describe("dynamic secret lease service metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("manual revocation", () => {
    test("records a success", async () => {
      const { service } = createService();

      await service.revokeLease({ ...actor, leaseId: "lease-1" });

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, phase: "manual", outcome: "success", attemptsExhausted: true }
      ]);
    });

    test("records a failure", async () => {
      const { service, provider } = createService();
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await service.revokeLease({ ...actor, leaseId: "lease-1" });

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, phase: "manual", outcome: "failure", attemptsExhausted: true }
      ]);
    });

    test("records nothing when a forced revoke swallows the error", async () => {
      const { service, provider } = createService();
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await service.revokeLease({ ...actor, leaseId: "lease-1", isForced: true });

      expect(outcomeCalls()).toEqual([]);
    });

    test("records a forced revoke that succeeded upstream", async () => {
      const { service } = createService();

      await service.revokeLease({ ...actor, leaseId: "lease-1", isForced: true });

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, phase: "manual", outcome: "success", attemptsExhausted: true }
      ]);
    });
  });

  describe("lease creation cleanup", () => {
    test("counts a credential left upstream when its lease and cleanup both fail", async () => {
      const { service, provider, dynamicSecretLeaseDAL } = createService();
      dynamicSecretLeaseDAL.create.mockRejectedValueOnce(new Error("insert failed"));
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await expect(service.create({ ...actor, name: "db" })).rejects.toThrow("insert failed");

      expect(vi.mocked(recordDynamicSecretUnrecordedCredentialMetric)).toHaveBeenCalledWith({ provider: PROVIDER });
    });

    test("does not count a credential the cleanup revoked", async () => {
      const { service, dynamicSecretLeaseDAL } = createService();
      dynamicSecretLeaseDAL.create.mockRejectedValueOnce(new Error("insert failed"));

      await expect(service.create({ ...actor, name: "db" })).rejects.toThrow("insert failed");

      expect(vi.mocked(recordDynamicSecretUnrecordedCredentialMetric)).not.toHaveBeenCalled();
    });
  });
});
