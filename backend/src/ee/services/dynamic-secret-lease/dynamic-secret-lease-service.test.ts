import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { NotFoundError } from "@app/lib/errors";
import {
  recordDynamicSecretRevocationOutcomeMetric,
  recordDynamicSecretStatusChangeMetric,
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
  recordDynamicSecretStatusChangeMetric: vi.fn(),
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

const createService = ({ revocationFailing = false, dynamicSecretOnPlan = true, projectDeleted = false } = {}) => {
  const cfg = { ...dynamicSecretCfg, name: "db", status: null, revocationFailing };
  const provider = {
    create: vi.fn(async (): Promise<{ entityId: string; data: unknown }> => ({ entityId: "entity-1", data: {} })),
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
      dynamicSecret: cfg
    })),
    updateById: vi.fn(async () => ({})),
    deleteById: vi.fn(async () => ({}))
  };

  const getProjectPermission = vi.fn(async () => ({
    permission: createMongoAbility([{ action: "manage", subject: "all" }])
  }));

  const service = dynamicSecretLeaseServiceFactory({
    dynamicSecretLeaseDAL: dynamicSecretLeaseDAL as never,
    dynamicSecretDAL: {
      findOne: vi.fn(async () => ({ ...cfg })),
      update: vi.fn(async (filter: { revocationFailing: boolean }, data: { revocationFailing: boolean }) => {
        if (filter.revocationFailing !== cfg.revocationFailing) return [];
        return [Object.assign(cfg, data)];
      })
    } as never,
    dynamicSecretProviders: { [PROVIDER]: provider } as never,
    dynamicSecretQueueService: {
      setLeaseRevocation: vi.fn(async () => undefined),
      unsetLeaseRevocation: vi.fn(async () => undefined),
      queueFailedRevocation: vi.fn(async () => undefined)
    } as never,
    licenseService: new FakeLicenseService().setPlan("org-1", { dynamicSecret: dynamicSecretOnPlan }),
    folderDAL: {
      findBySecretPath: vi.fn(async () => ({ id: "folder-1", envId: "env-1" })),
      findById: vi.fn(async () => ({
        id: "folder-1",
        envId: "env-1",
        projectId: "project-1",
        environment: { envSlug: "prod" }
      })),
      findSecretPathByFolderIds: vi.fn(async () => [{ path: "/certs" }])
    } as never,
    permissionService: { getProjectPermission } as never,
    projectDAL: {
      findProjectBySlug: vi.fn(async () => ({ id: "project-1" })),
      findById: vi.fn(async () => (projectDeleted ? undefined : { id: "project-1" }))
    } as never,
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: () => Buffer.from("{}")
      }))
    } as never,
    userDAL: { findById: vi.fn(async () => undefined) } as never,
    identityDAL: { findById: vi.fn(async () => undefined) } as never,
    secretValidationRuleService: { findConstraintsForGeneratedSecret: vi.fn(async () => ({ ruleNames: [] })) } as never
  });

  return { service, provider, dynamicSecretLeaseDAL, cfg, getProjectPermission };
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
        { provider: PROVIDER, trigger: "manual", outcome: "success", attemptsExhausted: true }
      ]);
    });

    test("records a failure", async () => {
      const { service, provider } = createService();
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await service.revokeLease({ ...actor, leaseId: "lease-1" });

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "manual", outcome: "failure", attemptsExhausted: true }
      ]);
    });

    test("records nothing when a forced revoke swallows the error", async () => {
      const { service, provider } = createService();
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await service.revokeLease({ ...actor, leaseId: "lease-1", isForced: true });

      expect(outcomeCalls()).toEqual([]);
    });

    test("clears a failing config's flag and records the recovery when a manual revoke succeeds", async () => {
      const { service, cfg } = createService({ revocationFailing: true });

      await service.revokeLease({ ...actor, leaseId: "lease-1" });

      expect(cfg.revocationFailing).toBe(false);
      expect(vi.mocked(recordDynamicSecretStatusChangeMetric).mock.calls).toEqual([
        [{ provider: PROVIDER, newStatus: "healthy" }]
      ]);
    });

    test("leaves a failing config's flag when a forced revoke swallowed the upstream error", async () => {
      const { service, provider, cfg } = createService({ revocationFailing: true });
      provider.revoke.mockRejectedValueOnce(new Error("connection refused"));

      await service.revokeLease({ ...actor, leaseId: "lease-1", isForced: true });

      expect(cfg.revocationFailing).toBe(true);
      expect(vi.mocked(recordDynamicSecretStatusChangeMetric)).not.toHaveBeenCalled();
    });

    test("records a forced revoke that succeeded upstream", async () => {
      const { service } = createService();

      await service.revokeLease({ ...actor, leaseId: "lease-1", isForced: true });

      expect(outcomeCalls()).toEqual([
        { provider: PROVIDER, trigger: "manual", outcome: "success", attemptsExhausted: true }
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

describe("a system lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const systemLease = {
    dynamicSecretId: dynamicSecretCfg.id,
    config: { agentVaultServiceId: "service-1" },
    identityName: "agent-vault",
    persistedLeaseFields: ["CLIENT_CERTIFICATE", "PRIVATE_KEY"]
  };

  test("checks no actor's permission, uses the default TTL, and seals the fields the caller reads back", async () => {
    const { service, provider, dynamicSecretLeaseDAL, getProjectPermission } = createService();
    provider.create.mockResolvedValueOnce({
      entityId: "entity-1",
      data: { CLIENT_CERTIFICATE: "cert", PRIVATE_KEY: "key", EXPIRES_AT: "2030-01-01T00:00:00.000Z" }
    });

    const before = Date.now();
    const result = await service.createSystemLease(systemLease);

    expect(getProjectPermission).not.toHaveBeenCalled();
    expect(result).toMatchObject({ projectId: "project-1", environment: "prod", secretPath: "/certs" });
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({ identity: { name: "agent-vault" }, config: { agentVaultServiceId: "service-1" } })
    );
    type TCreated = { expireAt: Date; config: unknown; encryptedLeaseData: Buffer };
    const created = (dynamicSecretLeaseDAL.create.mock.calls as unknown as [TCreated][])[0][0];
    expect(created.config).toEqual({ agentVaultServiceId: "service-1" });
    expect(JSON.parse(created.encryptedLeaseData.toString())).toEqual({
      CLIENT_CERTIFICATE: "cert",
      PRIVATE_KEY: "key"
    });
    expect(created.expireAt.getTime() - before).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(created.expireAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test("doesn't check the plan, which was checked when the caller saved the reference", async () => {
    const { service, provider } = createService({ dynamicSecretOnPlan: false });
    await expect(service.createSystemLease(systemLease)).resolves.toMatchObject({ projectId: "project-1" });
    expect(provider.create).toHaveBeenCalled();
  });

  test("isn't issued once the dynamic secret's project is deleted", async () => {
    const { service, provider } = createService({ projectDeleted: true });
    await expect(service.createSystemLease(systemLease)).rejects.toThrow(NotFoundError);
    expect(provider.create).not.toHaveBeenCalled();
  });

  test("a lease created through the API can't claim to be an Agent Vault service's", async () => {
    const { service, dynamicSecretLeaseDAL } = createService();
    await service.create({ ...actor, name: "db", config: { agentVaultServiceId: "service-1", namespace: "ns" } });
    const created = (dynamicSecretLeaseDAL.create.mock.calls as unknown as [{ config: unknown }][])[0][0];
    expect(created.config).toEqual({ namespace: "ns" });
  });
});
