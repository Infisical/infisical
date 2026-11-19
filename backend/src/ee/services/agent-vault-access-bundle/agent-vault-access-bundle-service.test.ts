import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { TAgentVaultServices } from "@app/db/schemas";
import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ConflictError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
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
  member = false,
  rules,
  variableKeys = []
}: {
  firstRead: TAgentVaultServices;
  locked: TAgentVaultServices;
  // A member reads the bundle's services but can't edit them.
  member?: boolean;
  // A role of its own, in place of admin or member.
  rules?: RawRuleOf<MongoAbility>[];
  variableKeys?: string[];
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
  const kmsDataKeyService = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
      })
    })
  };
  const licenseService = {
    getPlan: vi.fn().mockResolvedValue(Plan.restore(testFeatures()))
  };
  const agentVaultVariableDAL = {
    findKeys: vi.fn().mockResolvedValue(variableKeys.map((key) => ({ id: `variable-${key}`, key }))),
    lockForReference: vi.fn()
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
    agentVaultVariableDAL,
    agentVaultPersonalValueDAL: { delete: vi.fn(), deleteForServiceExceptFields: vi.fn() },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(
          rules ??
            (member
              ? [
                  {
                    action: ProjectPermissionAgentVaultAccessBundleActions.Read,
                    subject: ProjectPermissionSub.AgentVaultAccessBundles
                  }
                ]
              : [{ action: "manage", subject: "all" }])
        ),
        hasRole: () => !member,
        memberships: []
      })
    },
    membershipDAL: {
      findResourceMembershipsForActor: vi.fn().mockResolvedValue([{ isActive: true, scopeResourceId: BUNDLE_ID }])
    },
    agentVaultPersonalValueService: { findStatusesForOwner: vi.fn().mockResolvedValue([]) },
    kmsDataKeyService,
    licenseService
  } as unknown as Parameters<typeof agentVaultAccessBundleServiceFactory>[0]);
  return { service, agentVaultServiceDAL, agentVaultVariableDAL, kmsDataKeyService, licenseService };
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
    const { service, agentVaultServiceDAL, kmsDataKeyService } = buildService({ firstRead: stored, locked: stored });

    const result = await updatePort(service, { type: AgentVaultCredentialType.SshKey, certificate: null });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns).not.toHaveProperty("encryptedCredential");
    expect(columns.credentialConfig).toEqual({ type: AgentVaultCredentialType.SshKey, hasCertificate: false });
    expect(result.credentialReplaced).toBe(false);
    expect(kmsDataKeyService.createCipherPairWithDataKey).not.toHaveBeenCalled();
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
    const { service, agentVaultServiceDAL, kmsDataKeyService } = buildService({ firstRead: stored, locked: stored });

    const result = await updateSsh(service, {
      port: 2222,
      credential: { type: AgentVaultCredentialType.SshKey, certificate: "" }
    });

    expect(writtenColumns(agentVaultServiceDAL)).not.toHaveProperty("encryptedCredential");
    expect(result.credentialReplaced).toBe(false);
    expect(kmsDataKeyService.createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("custom headers read back from an SSH service are not reported as changed", async () => {
    const stored = sshService({ hasCertificate: false, secret: "key" });
    const { service } = buildService({ firstRead: stored, locked: stored });

    const result = await updateSsh(service, { port: 2222, customHeaders: [] });

    expect(result.update.customHeaders).toBeUndefined();
  });
});

const plainService = () => sshService({ hasCertificate: false, secret: "key" });

// Rows written before hooks moved to their own resource still carry these columns until a later release drops them.
const legacyHookedService = (): TAgentVaultServices => ({
  ...sshService({ hasCertificate: false, secret: "key" }),
  hookUrl: "https://hooks.example.com/agent-vault",
  encryptedHookSecret: Buffer.from("sealed")
});

describe("hooks moved off services", () => {
  test("an update writes no hook columns", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: legacyHookedService(),
      locked: legacyHookedService()
    });

    const result = await updateSsh(service, { port: 2222 });

    const columns = writtenColumns(agentVaultServiceDAL);
    expect(columns).not.toHaveProperty("hookUrl");
    expect(columns).not.toHaveProperty("encryptedHookSecret");
    expect(result.update).not.toHaveProperty("hookChanged");
  });

  test("a create writes no hook columns and checks no plan", async () => {
    const { service, agentVaultServiceDAL, licenseService } = buildService({
      firstRead: legacyHookedService(),
      locked: legacyHookedService()
    });

    await service.createService({
      projectId: PROJECT_ID,
      ctx,
      type: AgentVaultServiceType.Ssh,
      name: "bastion",
      host: "bastion.internal",
      port: 22,
      credential: { type: AgentVaultCredentialType.Basic, username: "agent", password: "p" }
    });

    const columns = agentVaultServiceDAL.create.mock.calls[0][0];
    expect(columns).not.toHaveProperty("hookUrl");
    expect(columns).not.toHaveProperty("encryptedHookSecret");
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("a read leaves out the hook a legacy row still holds", async () => {
    const admin = buildService({ firstRead: legacyHookedService(), locked: legacyHookedService() });
    const read = await admin.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID });
    expect(JSON.parse(JSON.stringify(read.service))).not.toHaveProperty("hook");
    expect(JSON.stringify(read)).not.toContain("hooks.example.com");
  });
});

describe("global variable references", () => {
  const bundleEditor = [
    {
      action: ProjectPermissionAgentVaultAccessBundleActions.Edit,
      subject: ProjectPermissionSub.AgentVaultAccessBundles
    }
  ];
  const withReadValue = [
    ...bundleEditor,
    {
      action: ProjectPermissionAgentVaultVariableActions.ReadValue,
      subject: ProjectPermissionSub.AgentVaultVariables
    }
  ];
  const create = (service: ReturnType<typeof buildService>["service"], password: string) =>
    service.createService({
      projectId: PROJECT_ID,
      ctx,
      type: AgentVaultServiceType.Ssh,
      name: "bastion",
      host: "bastion.internal",
      port: 22,
      credential: { type: AgentVaultCredentialType.Basic, username: "agent", password }
    });

  test.each(["{{DB_PASSWORD}}", "{{NOT_DEFINED}}"])(
    "a bundle editor without read-value can't save %s, and the key is never looked up",
    async (password) => {
      const built = buildService({
        firstRead: plainService(),
        locked: plainService(),
        rules: bundleEditor,
        variableKeys: ["DB_PASSWORD"]
      });

      await expect(create(built.service, password)).rejects.toBeInstanceOf(ForbiddenError);
      expect(built.agentVaultVariableDAL.findKeys).not.toHaveBeenCalled();
      expect(built.agentVaultServiceDAL.create).not.toHaveBeenCalled();
    }
  );

  test("a bundle editor without read-value can save a value that names no variable", async () => {
    const built = buildService({ firstRead: plainService(), locked: plainService(), rules: bundleEditor });

    await create(built.service, "plain-password");
    expect(built.agentVaultServiceDAL.create).toHaveBeenCalled();
  });

  test("with read-value, a reference is checked and stored", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      rules: withReadValue,
      variableKeys: ["DB_PASSWORD"]
    });

    await create(built.service, "{{DB_PASSWORD}}");
    expect(built.agentVaultServiceDAL.create).toHaveBeenCalled();
    await expect(create(built.service, "{{NOT_DEFINED}}")).rejects.toThrow("no global variable named 'NOT_DEFINED'");
  });

  test("an update that sends no new text needs no read-value", async () => {
    const built = buildService({
      firstRead: sshService({ hasCertificate: false, secret: "key" }),
      locked: sshService({ hasCertificate: false, secret: "key" }),
      rules: bundleEditor
    });

    await updatePort(built.service, undefined);
    expect(built.agentVaultServiceDAL.updateById).toHaveBeenCalled();
  });

  test("an update that types a reference needs read-value", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      rules: bundleEditor,
      variableKeys: ["DB_PASSWORD"]
    });

    await expect(
      updatePort(built.service, {
        type: AgentVaultCredentialType.Basic,
        username: "agent",
        password: "{{DB_PASSWORD}}"
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(built.agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("loading an MCP server's tools with a typed reference needs read-value", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      rules: bundleEditor,
      variableKeys: ["DB_PASSWORD"]
    });

    await expect(
      built.service.listMcpTools({
        projectId: PROJECT_ID,
        ctx,
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.StreamableHttp,
        credential: { type: AgentVaultCredentialType.Bearer, value: "{{DB_PASSWORD}}" }
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(built.agentVaultVariableDAL.findKeys).not.toHaveBeenCalled();
  });
});
