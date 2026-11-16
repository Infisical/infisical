import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { TAgentVaultServices } from "@app/db/schemas";
import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultCredentialType, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import {
  AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE,
  AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE,
  AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
} from "../agent-vault/agent-vault-hook-fns";
import { agentVaultAccessBundleServiceFactory } from "./agent-vault-access-bundle-service";

const PROJECT_ID = "project-1";
const BUNDLE_ID = "bundle-1";
const SERVICE_ID = "service-1";

type TUpdateServiceInput = Parameters<ReturnType<typeof agentVaultAccessBundleServiceFactory>["updateService"]>[0];

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as TUpdateServiceInput["ctx"];

const sshService = ({ hasCertificate, secret }: { hasCertificate: boolean; secret: string }): TAgentVaultServices => ({
  id: SERVICE_ID,
  projectId: PROJECT_ID,
  name: "bastion",
  type: AgentVaultServiceType.Ssh,
  hostPattern: null,
  config: { host: "bastion.internal", port: 22 },
  credentialType: AgentVaultCredentialType.SshKey,
  credentialConfig: { type: AgentVaultCredentialType.SshKey, hasCertificate },
  encryptedCredential: Buffer.from(secret),
  memberProvidedFields: null,
  allowedMethods: null,
  allowedPathPrefixes: null,
  allowedTools: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z")
});

// The first read and the row locked in the transaction differ when another save committed in between.
const buildService = ({
  firstRead,
  locked,
  hooksOnPlan = true,
  member = false
}: {
  firstRead: TAgentVaultServices;
  locked: TAgentVaultServices;
  hooksOnPlan?: boolean;
  // A member reads the bundle's services but can't edit them.
  member?: boolean;
}) => {
  const tx = {};
  const agentVaultServiceDAL = {
    findByIdInProject: vi.fn().mockResolvedValue(firstRead),
    lockByIdInProject: vi.fn().mockResolvedValue(locked),
    findByAccessBundleId: vi.fn().mockResolvedValue([]),
    findByNameInProject: vi.fn().mockResolvedValue(undefined),
    findBundlesForServices: vi.fn().mockResolvedValue(new Map([[SERVICE_ID, [{ id: BUNDLE_ID, name: "infra" }]]])),
    updateById: vi.fn(async (_id: string, columns: Partial<TAgentVaultServices>) => ({ ...locked, ...columns })),
    create: vi.fn(async (columns: Partial<TAgentVaultServices>) => ({
      ...firstRead,
      ...columns,
      id: SERVICE_ID,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    insertLinks: vi.fn(),
    findForList: vi.fn().mockResolvedValue({ services: [firstRead], totalCount: 1 }),
    findIdsInBundles: vi.fn().mockResolvedValue([SERVICE_ID]),
    transaction: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn(tx))
  };
  // The advisory lock the transaction takes first.
  Object.assign(tx, { raw: vi.fn() });
  const transformationDAL = () => ({
    findByServiceIds: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn(),
    updateById: vi.fn(),
    delete: vi.fn()
  });
  // The "sealed" bytes are the plaintext behind a marker, so a test can read what was sealed.
  const kmsService = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
      })
    })
  };
  const licenseService = {
    getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: hooksOnPlan }))
  };
  const service = agentVaultAccessBundleServiceFactory({
    agentVaultAccessBundleDAL: {
      findByIdInProject: vi.fn().mockResolvedValue({ id: BUNDLE_ID, name: "infra", projectId: PROJECT_ID }),
      lockByIdInProject: vi.fn().mockResolvedValue({ id: BUNDLE_ID, name: "infra", projectId: PROJECT_ID })
    },
    agentVaultServiceDAL,
    agentVaultServiceCustomHeaderDAL: transformationDAL(),
    agentVaultServiceSubstitutionDAL: transformationDAL(),
    agentVaultServiceVariableReferenceDAL: {
      findByServiceIds: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      insertMany: vi.fn()
    },
    agentVaultVariableDAL: { findKeys: vi.fn().mockResolvedValue([]), lockForReference: vi.fn() },
    agentVaultPersonalValueDAL: { delete: vi.fn(), deleteForServiceExceptFields: vi.fn() },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(
          member
            ? [
                {
                  action: ProjectPermissionAgentVaultAccessBundleActions.Read,
                  subject: ProjectPermissionSub.AgentVaultAccessBundles
                }
              ]
            : [{ action: "manage", subject: "all" }]
        ),
        hasRole: () => !member,
        memberships: []
      })
    },
    membershipDAL: {
      findResourceMembershipsForActor: vi.fn().mockResolvedValue([{ isActive: true, scopeResourceId: BUNDLE_ID }])
    },
    agentVaultPersonalValueService: { findStatusesForOwner: vi.fn().mockResolvedValue([]) },
    kmsService,
    licenseService
  } as unknown as Parameters<typeof agentVaultAccessBundleServiceFactory>[0]);
  return { service, agentVaultServiceDAL, kmsService, licenseService };
};

const updatePort = (
  service: ReturnType<typeof buildService>["service"],
  credential: TUpdateServiceInput["credential"]
) =>
  service.updateService({
    projectId: PROJECT_ID,
    ctx,
    serviceId: SERVICE_ID,
    type: AgentVaultServiceType.Ssh,
    port: 2222,
    credential
  });

const updateSsh = (service: ReturnType<typeof buildService>["service"], fields: Partial<TUpdateServiceInput>) =>
  service.updateService({
    projectId: PROJECT_ID,
    ctx,
    serviceId: SERVICE_ID,
    type: AgentVaultServiceType.Ssh,
    ...fields
  });

const writtenColumns = (dal: ReturnType<typeof buildService>["agentVaultServiceDAL"]) =>
  dal.updateById.mock.calls[0][1] as Partial<TAgentVaultServices>;

describe("updateService, an SSH key save that writes no secret", () => {
  test("keeps a certificate another save added while this one was in progress", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: sshService({ hasCertificate: false, secret: "key" }),
      locked: sshService({ hasCertificate: true, secret: "key-and-certificate" })
    });

    const result = await updatePort(service, { type: AgentVaultCredentialType.SshKey });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns.credentialConfig).toEqual({ type: AgentVaultCredentialType.SshKey, hasCertificate: true });
    expect(columns).not.toHaveProperty("encryptedCredential");
    expect(columns.config).toEqual({ host: "bastion.internal", port: 2222 });
    expect(result.service.credential).toEqual({ type: AgentVaultCredentialType.SshKey, hasCertificate: true });
    expect(result.credentialReplaced).toBe(false);
  });

  test("keeps a certificate removal another save made while this one was in progress", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: sshService({ hasCertificate: true, secret: "key-and-certificate" }),
      locked: sshService({ hasCertificate: false, secret: "key" })
    });

    await updatePort(service, { type: AgentVaultCredentialType.SshKey });

    expect(writtenColumns(agentVaultServiceDAL).credentialConfig).toEqual({
      type: AgentVaultCredentialType.SshKey,
      hasCertificate: false
    });
  });

  test("refuses to remove a certificate another save added while this one was in progress", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: sshService({ hasCertificate: false, secret: "key" }),
      locked: sshService({ hasCertificate: true, secret: "key-and-certificate" })
    });

    await expect(
      updatePort(service, { type: AgentVaultCredentialType.SshKey, certificate: null })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("refuses to remove a certificate when another save replaced the key", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: sshService({ hasCertificate: false, secret: "key" }),
      locked: sshService({ hasCertificate: false, secret: "rotated-key" })
    });

    await expect(
      updatePort(service, { type: AgentVaultCredentialType.SshKey, certificate: null })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("with no concurrent save, writes no secret and replaces no credential", async () => {
    const stored = sshService({ hasCertificate: false, secret: "key" });
    const { service, agentVaultServiceDAL, kmsService } = buildService({ firstRead: stored, locked: stored });

    const result = await updatePort(service, { type: AgentVaultCredentialType.SshKey, certificate: null });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns).not.toHaveProperty("encryptedCredential");
    expect(columns.credentialConfig).toEqual({ type: AgentVaultCredentialType.SshKey, hasCertificate: false });
    expect(result.credentialReplaced).toBe(false);
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalled();
  });
});

describe("updateService, the service it returns", () => {
  test("an SSH service carries only its own type's fields", async () => {
    const stored = sshService({ hasCertificate: false, secret: "key" });
    const { service } = buildService({ firstRead: stored, locked: stored });

    const result = await updatePort(service, { type: AgentVaultCredentialType.SshKey });

    expect(Object.keys(result.service).sort()).toEqual(
      [
        "id",
        "accessBundles",
        "name",
        "description",
        "type",
        "host",
        "port",
        "credential",
        "variableReferences",
        "hook",
        "createdAt",
        "updatedAt"
      ].sort()
    );
    expect(result.service).toMatchObject({ type: AgentVaultServiceType.Ssh, host: "bastion.internal", port: 2222 });
  });
});

describe("updateService, what the audit is told changed", () => {
  test("an empty certificate with none stored writes no secret and replaces no credential", async () => {
    const stored = sshService({ hasCertificate: false, secret: "key" });
    const { service, agentVaultServiceDAL, kmsService } = buildService({ firstRead: stored, locked: stored });

    const result = await updateSsh(service, {
      port: 2222,
      credential: { type: AgentVaultCredentialType.SshKey, certificate: "" }
    });

    expect(writtenColumns(agentVaultServiceDAL)).not.toHaveProperty("encryptedCredential");
    expect(result.credentialReplaced).toBe(false);
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("custom headers read back from an SSH service are not reported as changed", async () => {
    const stored = sshService({ hasCertificate: false, secret: "key" });
    const { service } = buildService({ firstRead: stored, locked: stored });

    const result = await updateSsh(service, { port: 2222, customHeaders: [] });

    expect(result.update.customHeaders).toBeUndefined();
  });
});

const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);
const sealedSecret = (secret: string) =>
  Buffer.concat([Buffer.from("sealed:"), Buffer.from(JSON.stringify({ value: secret }))]);
const hookedService = (hookUrl: string | null = HOOK_URL, secret = "old-secret"): TAgentVaultServices => ({
  ...sshService({ hasCertificate: false, secret: "key" }),
  hookUrl,
  encryptedHookSecret: hookUrl ? sealedSecret(secret) : null
});
const plainService = () => hookedService(null);

describe("updateService, hooks", () => {
  test("sets a hook on a service with none", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: plainService() });

    const result = await updateSsh(service, { hook: { url: HOOK_URL, signingSecret: SECRET } });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns.hookUrl).toBe(HOOK_URL);
    expect(columns.encryptedHookSecret).toEqual(sealedSecret(SECRET));
    expect(result.update).toMatchObject({ hookChanged: "set", hookUrl: HOOK_URL, hookSecretReplaced: true });
    expect(result.service.hook).toEqual({ url: HOOK_URL });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  test("a URL-only change keeps the stored secret", async () => {
    const { service, agentVaultServiceDAL, kmsService } = buildService({
      firstRead: hookedService(),
      locked: hookedService()
    });

    const result = await updateSsh(service, { hook: { url: "https://hooks.example.com/other" } });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns.hookUrl).toBe("https://hooks.example.com/other");
    expect(columns).not.toHaveProperty("encryptedHookSecret");
    expect(result.update).toMatchObject({
      hookChanged: "updated",
      hookUrl: "https://hooks.example.com/other",
      hookSecretReplaced: false
    });
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("a secret-only change writes the secret and reports no URL", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: hookedService(), locked: hookedService() });

    const result = await updateSsh(service, { hook: { url: HOOK_URL, signingSecret: SECRET } });

    expect(writtenColumns(agentVaultServiceDAL).encryptedHookSecret).toEqual(sealedSecret(SECRET));
    expect(result.update.hookUrl).toBeUndefined();
    expect(result.update).toMatchObject({ hookChanged: "updated", hookSecretReplaced: true });
  });

  test("null removes the hook and its secret", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: hookedService(), locked: hookedService() });

    const result = await updateSsh(service, { hook: null });

    expect(writtenColumns(agentVaultServiceDAL)).toMatchObject({ hookUrl: null, encryptedHookSecret: null });
    expect(result.update).toMatchObject({ hookChanged: "removed", hookSecretReplaced: false });
    expect(result.service.hook).toBeNull();
  });

  test("an echo of the stored hook is not an update on its own, and checks no plan", async () => {
    const { service, agentVaultServiceDAL, licenseService } = buildService({
      firstRead: hookedService(),
      locked: hookedService()
    });

    await expect(updateSsh(service, { hook: { url: HOOK_URL } })).rejects.toThrow(
      "Provide at least one field besides 'type' to update"
    );
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("null on a service with no hook writes no hook columns and reports nothing", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: plainService() });

    const result = await updateSsh(service, { port: 2222, hook: null });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns).not.toHaveProperty("hookUrl");
    expect(columns).not.toHaveProperty("encryptedHookSecret");
    expect(result.update).not.toHaveProperty("hookChanged");
    expect(result.update).not.toHaveProperty("hookSecretReplaced");
  });

  test("setting a hook without a secret is refused", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: plainService() });

    const error = await updateSsh(service, { hook: { url: HOOK_URL } }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toBe(AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE);
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("with hooks off the plan, setting or changing one is refused and removing one is allowed", async () => {
    const off = (stored: TAgentVaultServices) =>
      buildService({ firstRead: stored, locked: stored, hooksOnPlan: false });

    await expect(
      updateSsh(off(plainService()).service, { hook: { url: HOOK_URL, signingSecret: SECRET } })
    ).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    await expect(
      updateSsh(off(hookedService()).service, { hook: { url: "https://hooks.example.com/other" } })
    ).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);

    const removal = off(hookedService());
    const result = await updateSsh(removal.service, { hook: null });
    expect(result.update.hookChanged).toBe("removed");
    expect(removal.licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("refuses to set a hook another save set while this one was in progress", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: hookedService() });

    const error = await updateSsh(service, { hook: { url: HOOK_URL, signingSecret: SECRET } }).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE);
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test.each([
    { why: "change", hook: { url: "https://hooks.example.com/other" } },
    { why: "remove", hook: null }
  ])("refuses to $why a hook another save removed while this one was in progress", async ({ hook }) => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: hookedService(), locked: plainService() });

    await expect(updateSsh(service, { hook })).rejects.toThrow(AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE);
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("a hook-only update reaches the row", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: hookedService(), locked: hookedService() });

    await updateSsh(service, { hook: { url: "https://hooks.example.com/other" } });

    expect(agentVaultServiceDAL.updateById).toHaveBeenCalledTimes(1);
  });
});

describe("createService, hooks", () => {
  const create = (service: ReturnType<typeof buildService>["service"]) =>
    service.createService({
      projectId: PROJECT_ID,
      ctx,
      type: AgentVaultServiceType.Ssh,
      name: "bastion",
      host: "bastion.internal",
      port: 22,
      credential: { type: AgentVaultCredentialType.Basic, username: "agent", password: "p" },
      hook: { url: HOOK_URL, signingSecret: SECRET }
    });

  test("stores the URL and the sealed secret, and returns only the URL", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: plainService() });

    const result = await create(service);

    const columns = agentVaultServiceDAL.create.mock.calls[0][0];
    expect(columns.hookUrl).toBe(HOOK_URL);
    expect(columns.encryptedHookSecret).toEqual(sealedSecret(SECRET));
    expect(result.service.hook).toEqual({ url: HOOK_URL });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  test("is refused with hooks off the plan", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: plainService(),
      locked: plainService(),
      hooksOnPlan: false
    });

    await expect(create(service)).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    expect(agentVaultServiceDAL.create).not.toHaveBeenCalled();
  });
});

describe("service reads, hooks", () => {
  test("an admin sees the hook's URL and a member doesn't see the hook", async () => {
    const admin = buildService({ firstRead: hookedService(), locked: hookedService() });
    expect(
      (await admin.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID })).service.hook
    ).toEqual({ url: HOOK_URL });
    expect(
      (await admin.service.listServices({ projectId: PROJECT_ID, ctx, limit: 50, offset: 0 })).services[0].hook
    ).toEqual({
      url: HOOK_URL
    });

    const member = buildService({ firstRead: hookedService(), locked: hookedService(), member: true });
    const read = await member.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID });
    expect(read.service.hook).toBeUndefined();
    expect(JSON.parse(JSON.stringify(read.service))).not.toHaveProperty("hook");
    const list = await member.service.listServices({ projectId: PROJECT_ID, ctx, limit: 50, offset: 0 });
    expect(list.services[0].hook).toBeUndefined();
  });
});
