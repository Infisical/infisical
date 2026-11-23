import { KeyObject, webcrypto } from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { TDynamicSecretLeases } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";
import { EventType } from "../audit-log/audit-log-types";
import { isLeaseFresh } from "./agent-vault-dynamic-secret-fns";
import { agentVaultDynamicSecretServiceFactory } from "./agent-vault-dynamic-secret-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const AGENT_VAULT_PROJECT_ID = "agent-vault-project";
const DYNAMIC_SECRET_ID = "66666666-6666-4666-8666-666666666666";
const MINUTE = 60 * 1000;
const NEW_LEASE_EXPIRE_AT = new Date("2035-01-01T00:00:00.000Z");

const reference = {
  dynamicSecretId: DYNAMIC_SECRET_ID,
  projectId: "secrets-project",
  environment: "prod",
  secretPath: "/certs",
  name: "engine-client"
};

let certificate = "";
let privateKey = "";

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const keys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=agent-vault",
    notBefore: new Date("2020-01-01T00:00:00.000Z"),
    notAfter: new Date("2035-01-01T00:00:00.000Z"),
    signingAlgorithm: alg,
    keys
  });
  certificate = `${cert.toString("pem")}\n`;
  privateKey = KeyObject.from(keys.privateKey).export({ type: "pkcs8", format: "pem" }) as string;
});

const lease = ({
  id = "lease-1",
  ageMs,
  leftMs,
  data = { CLIENT_CERTIFICATE: certificate, PRIVATE_KEY: privateKey, EXPIRES_AT: "2035-01-01T00:00:00.000Z" }
}: {
  id?: string;
  ageMs: number;
  leftMs: number;
  data?: Record<string, string>;
}) =>
  ({
    id,
    dynamicSecretId: DYNAMIC_SECRET_ID,
    createdAt: new Date(Date.now() - ageMs),
    expireAt: new Date(Date.now() + leftMs),
    config: { agentVaultServiceId: SERVICE_ID },
    encryptedLeaseData: Buffer.from(JSON.stringify(data))
  }) as unknown as TDynamicSecretLeases;

const setup = ({
  leases = [] as TDynamicSecretLeases[][],
  lockHeld = false,
  createSystemLease = async () => ({
    lease: {
      id: "lease-new",
      dynamicSecretId: DYNAMIC_SECRET_ID,
      externalEntityId: "cert-1",
      createdAt: new Date(),
      expireAt: NEW_LEASE_EXPIRE_AT
    },
    dynamicSecret: { id: DYNAMIC_SECRET_ID, name: reference.name, type: "namespace" },
    projectId: reference.projectId,
    environment: reference.environment,
    secretPath: reference.secretPath,
    data: { CLIENT_CERTIFICATE: certificate, PRIVATE_KEY: privateKey, EXPIRES_AT: "2035-01-01T00:00:00.000Z" }
  }),
  storedService = {
    projectId: AGENT_VAULT_PROJECT_ID,
    credentialType: AgentVaultCredentialType.DynamicSecret,
    credentialConfig: { type: AgentVaultCredentialType.DynamicSecret, ...reference }
  } as { projectId: string; credentialType: string; credentialConfig: unknown } | null,
  providerType = "namespace",
  permissionRules = [
    { action: ProjectPermissionDynamicSecretActions.Lease, subject: ProjectPermissionSub.DynamicSecrets }
  ] as { action: string; subject: string; conditions?: unknown }[],
  isMember = true,
  orgId = "org-1",
  dynamicSecretOnPlan = true,
  agentVaultProjectDeleted = false
} = {}) => {
  // Each read returns the next snapshot, the last one repeating.
  let reads = 0;
  const findLeasesForService = vi.fn(async () => {
    const snapshot = leases[Math.min(reads, leases.length - 1)] ?? [];
    reads += 1;
    return snapshot;
  });
  const release = vi.fn(async () => ({}));
  const acquireLock = vi.fn(async () => {
    if (lockHeld) throw new Error("The operation was unable to achieve a quorum during its retry window.");
    return { release };
  });
  const createLease = vi.fn(createSystemLease);
  const createAuditLog = vi.fn(async () => {});
  const setLeaseRevocation = vi.fn(async () => {});
  const getProjectPermission = vi.fn(async () => {
    if (!isMember) throw new ForbiddenRequestError({ name: "ProjectMembershipNotFound", message: "Not a member" });
    return { permission: createMongoAbility(permissionRules as never) };
  });

  const service = agentVaultDynamicSecretServiceFactory({
    agentVaultDynamicSecretDAL: {
      findLeasesForService,
      findExistingDynamicSecretIds: async (ids: string[]) => new Set(ids)
    },
    dynamicSecretDAL: {
      findOne: async ({ id }: { id?: string }) =>
        (id === DYNAMIC_SECRET_ID
          ? { id, name: reference.name, folderId: "folder-1", metadata: [], type: providerType, defaultTTL: "1h" }
          : undefined) as never
    } as never,
    agentVaultServiceDAL: { findByIdPrimary: async () => (storedService ?? undefined) as never },
    folderDAL: {
      findById: async () =>
        ({ id: "folder-1", projectId: reference.projectId, environment: { envSlug: reference.environment } }) as never,
      findSecretPathByFolderIds: async () => [{ path: reference.secretPath }] as never
    },
    projectDAL: {
      findById: async (id: string) =>
        (id === AGENT_VAULT_PROJECT_ID && agentVaultProjectDeleted
          ? undefined
          : { id, orgId, name: "Secrets" }) as never,
      transaction: async (cb: (tx: never) => Promise<unknown>) => cb({} as never)
    } as never,
    permissionService: { getProjectPermission } as never,
    dynamicSecretLeaseService: { createSystemLease: createLease as never },
    dynamicSecretQueueService: { setLeaseRevocation },
    kmsDataKeyService: {
      createCipherPairWithDataKey: async () =>
        ({ decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob }) as never
    },
    keyStore: { acquireLock: acquireLock as never },
    licenseService: new FakeLicenseService().setPlan(orgId, { dynamicSecret: dynamicSecretOnPlan }),
    auditLogService: { createAuditLog }
  });
  return {
    service,
    findLeasesForService,
    acquireLock,
    release,
    createLease,
    setLeaseRevocation,
    getProjectPermission,
    createAuditLog
  };
};

const resolve = (service: ReturnType<typeof setup>["service"], onFallback?: () => void) =>
  service.resolveClientCertificate({
    serviceId: SERVICE_ID,
    serviceName: "engine",
    agentVaultProjectId: AGENT_VAULT_PROJECT_ID,
    reference,
    pollIntervalSeconds: 60,
    onFallback
  });

describe("a lease's freshness", () => {
  const at = (lifetimeMs: number, leftMs: number, pollIntervalSeconds = 60) => {
    const now = new Date();
    return isLeaseFresh(
      {
        issuedAt: new Date(now.getTime() - (lifetimeMs - leftMs)),
        expiresAt: new Date(now.getTime() + leftMs),
        pollIntervalSeconds
      },
      now
    );
  };

  test("needs more than 5 minutes left on a short lease", () => {
    expect(at(20 * MINUTE, 6 * MINUTE)).toBe(true);
    expect(at(20 * MINUTE, 4 * MINUTE)).toBe(false);
  });
});

describe("resolving a dynamic secret's client certificate", () => {
  test("reuses a fresh lease without taking a new one", async () => {
    const { service, createLease } = setup({
      leases: [[lease({ ageMs: 10 * MINUTE, leftMs: 50 * MINUTE })]]
    });

    expect(await resolve(service)).toEqual({
      credential: { type: AgentVaultCredentialType.ClientCertificate, certificate, privateKey }
    });
    expect(createLease).not.toHaveBeenCalled();
  });

  test("takes a new lease when the one it has is near expiry", async () => {
    const { service, createLease } = setup({
      leases: [[lease({ ageMs: 57 * MINUTE, leftMs: 3 * MINUTE })]]
    });

    expect(await resolve(service)).toEqual({
      credential: { type: AgentVaultCredentialType.ClientCertificate, certificate, privateKey }
    });
    expect(createLease).toHaveBeenCalledWith({
      dynamicSecretId: DYNAMIC_SECRET_ID,
      config: { agentVaultServiceId: SERVICE_ID },
      identityName: "agent-vault",
      persistedLeaseFields: ["CLIENT_CERTIFICATE", "PRIVATE_KEY"]
    });
  });

  test("never leases while another resolve holds the lock", async () => {
    const held = setup({ leases: [[]], lockHeld: true });
    expect(await resolve(held.service)).toEqual({ problem: expect.stringContaining("Another resolve") as string });
    expect(held.createLease).not.toHaveBeenCalled();

    const finished = setup({ leases: [[], [lease({ ageMs: 0, leftMs: 60 * MINUTE })]], lockHeld: true });
    expect(await resolve(finished.service)).toMatchObject({ credential: { certificate } });
  });

  test("reports a lease that can't be created as a problem", async () => {
    const { service } = setup({
      createSystemLease: async () => {
        throw new BadRequestError({ message: "Max lease limit reached. Limit: 100" });
      }
    });

    expect(await resolve(service)).toEqual({
      problem:
        "Couldn't lease a client certificate from the dynamic secret 'engine-client': Max lease limit reached. Limit: 100"
    });
  });
});

describe("falling back to the service's older certificate", () => {
  const older = () => lease({ id: "lease-old", ageMs: 57 * MINUTE, leftMs: 3 * MINUTE });

  test("when the new lease can't be created", async () => {
    const { service } = setup({
      leases: [[older()]],
      createSystemLease: async () => {
        throw new BadRequestError({ message: "Max lease limit reached. Limit: 100" });
      }
    });
    expect(await resolve(service)).toMatchObject({ credential: { certificate, privateKey } });
  });
});

describe("a lease resolve creates", () => {
  test("is audited in the dynamic secret's project as the platform, without its data", async () => {
    const { service, createAuditLog } = setup();
    await resolve(service);
    expect(createAuditLog).toHaveBeenCalledWith({
      projectId: reference.projectId,
      actor: { type: "platform", metadata: {} },
      event: {
        type: EventType.CREATE_DYNAMIC_SECRET_LEASE,
        metadata: {
          dynamicSecretName: reference.name,
          dynamicSecretType: "namespace",
          dynamicSecretId: DYNAMIC_SECRET_ID,
          projectId: reference.projectId,
          environment: reference.environment,
          secretPath: reference.secretPath,
          leaseId: "lease-new",
          leaseExternalEntityId: "cert-1",
          leaseExpireAt: NEW_LEASE_EXPIRE_AT,
          agentVaultServiceId: SERVICE_ID,
          agentVaultServiceName: "engine",
          agentVaultProjectId: AGENT_VAULT_PROJECT_ID
        }
      }
    });
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("PRIVATE KEY");
  });

  test("is given back when the service was deleted or switched secrets meanwhile", async () => {
    const deleted = setup({ storedService: null });
    const before = Date.now();
    expect(await resolve(deleted.service)).toEqual({ problem: expect.stringContaining("deleted") as string });
    expect(deleted.setLeaseRevocation).toHaveBeenCalledWith(
      "lease-new",
      DYNAMIC_SECRET_ID,
      expect.any(Date),
      "lease-new-agent-vault-revoke"
    );
    const [[, , revokeAt]] = deleted.setLeaseRevocation.mock.calls as unknown as [string, string, Date][];
    expect(revokeAt.getTime() - before).toBeGreaterThanOrEqual(MINUTE);

    const switched = setup({
      storedService: {
        projectId: AGENT_VAULT_PROJECT_ID,
        credentialType: AgentVaultCredentialType.DynamicSecret,
        credentialConfig: { ...reference, dynamicSecretId: "other-secret" }
      }
    });
    expect(await resolve(switched.service)).toHaveProperty("problem");
    expect(switched.setLeaseRevocation).toHaveBeenCalledTimes(1);
  });

  test("is given back when the service's Agent Vault project was deleted meanwhile", async () => {
    const { service, setLeaseRevocation } = setup({ agentVaultProjectDeleted: true });
    expect(await resolve(service)).toHaveProperty("problem");
    expect(setLeaseRevocation).toHaveBeenCalledTimes(1);
  });

  test("is given back when it expires before the next poll, since the default TTL was shortened after save", async () => {
    const { service, setLeaseRevocation } = setup({
      createSystemLease: async () => ({
        lease: {
          id: "lease-new",
          dynamicSecretId: DYNAMIC_SECRET_ID,
          externalEntityId: "cert-1",
          createdAt: new Date(),
          expireAt: new Date(Date.now() + 90 * 1000)
        },
        dynamicSecret: { id: DYNAMIC_SECRET_ID, name: reference.name, type: "namespace" },
        projectId: reference.projectId,
        environment: reference.environment,
        secretPath: reference.secretPath,
        data: { CLIENT_CERTIFICATE: certificate, PRIVATE_KEY: privateKey, EXPIRES_AT: "2035-01-01T00:00:00.000Z" }
      })
    });

    expect(await resolve(service)).toEqual({
      problem: expect.stringContaining("Raise its default TTL to 10m or more.") as string
    });
    expect(setLeaseRevocation).toHaveBeenCalledWith(
      "lease-new",
      DYNAMIC_SECRET_ID,
      expect.any(Date),
      "lease-new-agent-vault-revoke"
    );
  });
});

describe("saving a service with a dynamic secret", () => {
  const ctx = { actor: ActorType.USER, actorId: "user-1", actorAuthMethod: AuthMethod.EMAIL, actorOrgId: "org-1" };

  test("records the reference and where the secret lives once the caller may lease from it", async () => {
    const { service, getProjectPermission } = setup();
    expect(await service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).toEqual(reference);
    expect(getProjectPermission).toHaveBeenCalledWith(expect.objectContaining({ projectId: reference.projectId }));
  });

  test("is refused without permission to lease it, or outside its project", async () => {
    const noLease = setup({
      permissionRules: [
        {
          action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject: ProjectPermissionSub.DynamicSecrets
        }
      ]
    });
    await expect(noLease.service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      ForbiddenError
    );

    const otherPath = setup({
      permissionRules: [
        {
          action: ProjectPermissionDynamicSecretActions.Lease,
          subject: ProjectPermissionSub.DynamicSecrets,
          conditions: { secretPath: { $glob: "/other/**" } }
        }
      ]
    });
    await expect(otherPath.service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      ForbiddenError
    );

    const notMember = setup({ isMember: false });
    await expect(notMember.service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      ForbiddenRequestError
    );
  });

  test("is refused when the org's plan doesn't include dynamic secrets", async () => {
    const { service } = setup({ dynamicSecretOnPlan: false });
    await expect(service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      "Your current plan does not include Dynamic Secrets"
    );
  });

  test("is refused for a secret that doesn't exist or is in another org", async () => {
    const { service } = setup();
    await expect(service.prepareReference({ dynamicSecretId: "nope", ctx })).rejects.toThrow(NotFoundError);
    const otherOrg = setup({ orgId: "org-2" });
    await expect(otherOrg.service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      NotFoundError
    );
  });

  test("is refused for a provider that doesn't issue client certificates", async () => {
    const { service } = setup({ providerType: "aws-iam" });
    await expect(service.prepareReference({ dynamicSecretId: DYNAMIC_SECRET_ID, ctx })).rejects.toThrow(
      "is a 'aws-iam' dynamic secret, which doesn't issue client certificates"
    );
  });
});

describe("revoking a service's leases", () => {
  test("queues the revocation of the service's leases of that dynamic secret without waiting on a lease", async () => {
    const { service, findLeasesForService, setLeaseRevocation, acquireLock } = setup({
      leases: [[lease({ ageMs: 0, leftMs: MINUTE })]],
      lockHeld: true
    });

    await service.revokeServiceLeases({ serviceId: SERVICE_ID, dynamicSecretId: DYNAMIC_SECRET_ID });

    expect(acquireLock).not.toHaveBeenCalled();
    expect(findLeasesForService).toHaveBeenCalledWith({ serviceId: SERVICE_ID, dynamicSecretId: DYNAMIC_SECRET_ID });
    expect(setLeaseRevocation).toHaveBeenCalledTimes(1);
    expect(setLeaseRevocation).toHaveBeenCalledWith(
      "lease-1",
      DYNAMIC_SECRET_ID,
      expect.any(Date),
      "lease-1-agent-vault-revoke"
    );
  });

  test("never throws: a failure is logged and the expiry queue revokes the lease later", async () => {
    const { service, setLeaseRevocation } = setup({ leases: [[lease({ ageMs: 0, leftMs: MINUTE })]] });
    setLeaseRevocation.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      service.revokeServiceLeases({ serviceId: SERVICE_ID, dynamicSecretId: DYNAMIC_SECRET_ID })
    ).resolves.toBeUndefined();
  });
});
