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

import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "../agent-vault-hook/agent-vault-hook-fns";
import { hashAccessToken } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import {
  agentVaultAccessBundleServiceFactory,
  HTTP_OAUTH_NEEDS_VARIABLE_MESSAGE
} from "./agent-vault-access-bundle-service";
import { McpListError } from "./agent-vault-mcp-tool-list-fns";

const listMcpServerTools = vi.hoisted(() => vi.fn());
vi.mock("./agent-vault-mcp-tool-list-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent-vault-mcp-tool-list-fns")>()),
  listMcpServerTools
}));

const PROJECT_ID = "project-1";
const BUNDLE_ID = "bundle-1";
const SERVICE_ID = "service-1";
const SAVED_HOOK = { id: "00000000-0000-4000-8000-0000000000aa", name: "approvals" };

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
  variableKeys = [],
  oauthVariableKeys = [],
  oauthVariableTokens = {},
  hooksOnPlan = true,
  savedHooks = [SAVED_HOOK]
}: {
  firstRead: TAgentVaultServices;
  locked: TAgentVaultServices;
  // A member reads the bundle's services but can't edit them.
  member?: boolean;
  // A role of its own, in place of admin or member.
  rules?: RawRuleOf<MongoAbility>[];
  variableKeys?: string[];
  oauthVariableKeys?: string[];
  // The access token each connected OAuth variable holds, by key. One left out isn't connected.
  oauthVariableTokens?: Record<string, string>;
  hooksOnPlan?: boolean;
  // The project's saved hooks.
  savedHooks?: { id: string; name: string }[];
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
      }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob.subarray("sealed:".length)
    })
  };
  const licenseService = {
    getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: hooksOnPlan }))
  };
  const hookNamed = async ({ name }: { name: string }) => savedHooks.find((hook) => hook.name === name);
  const agentVaultHookDAL = {
    findByNameInProject: vi.fn(hookNamed),
    findByNameForService: vi.fn(hookNamed),
    findNamesByIds: vi.fn(
      async ({ ids }: { ids: string[] }) =>
        new Map(savedHooks.filter((hook) => ids.includes(hook.id)).map((hook) => [hook.id, hook.name]))
    )
  };
  const agentVaultVariableDAL = {
    findKeys: vi
      .fn()
      .mockResolvedValue([
        ...variableKeys.map((key) => ({ id: `variable-${key}`, key, type: AgentVaultVariableType.Text })),
        ...oauthVariableKeys.map((key) => ({ id: `variable-${key}`, key, type: AgentVaultVariableType.OAuth }))
      ]),
    lockForReference: vi.fn(async ({ variableIds }: { variableIds: string[] }) => variableIds),
    findValuesForResolve: vi.fn().mockResolvedValue([]),
    findOauthForResolve: vi.fn(async ({ variableIds }: { variableIds: string[] }) =>
      oauthVariableKeys
        .map((key) => {
          const token = oauthVariableTokens[key];
          return {
            id: `variable-${key}`,
            key,
            encryptedValue: token ? Buffer.from(`sealed:${JSON.stringify({ accessToken: token })}`) : null,
            oauthConfig: {
              settings: {},
              connection: token
                ? { status: "connected", issuer: "https://accounts.google.com", grantedScopes: ["drive"] }
                : null
            }
          };
        })
        .filter((row) => variableIds.includes(row.id))
    )
  };
  const agentVaultServiceVariableReferenceDAL = {
    findByServiceIds: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    insertMany: vi.fn()
  };
  const agentVaultOauthService = {
    refreshServiceToken: vi.fn(async () => ({
      credential: { value: "refreshed-access" },
      status: "connected"
    })),
    refreshVariableToken: vi.fn<
      (dto: { rejectedTokenHash?: string }) => Promise<{ credential: { value: string }; status: string }>
    >(async () => ({
      credential: { value: "variable-refreshed-access" },
      status: "connected"
    }))
  };
  const service = agentVaultAccessBundleServiceFactory({
    agentVaultAccessBundleDAL: {
      findByIdInProject: vi.fn().mockResolvedValue({ id: BUNDLE_ID, name: "infra", projectId: PROJECT_ID }),
      lockByIdInProject: vi.fn().mockResolvedValue({ id: BUNDLE_ID, name: "infra", projectId: PROJECT_ID })
    },
    agentVaultServiceDAL,
    agentVaultServiceCustomHeaderDAL: transformationDAL(),
    agentVaultServiceSubstitutionDAL: transformationDAL(),
    agentVaultServiceVariableReferenceDAL,
    agentVaultVariableDAL,
    agentVaultOauthService,
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
    licenseService,
    agentVaultHookDAL
  } as unknown as Parameters<typeof agentVaultAccessBundleServiceFactory>[0]);
  return {
    service,
    agentVaultServiceDAL,
    agentVaultVariableDAL,
    agentVaultServiceVariableReferenceDAL,
    agentVaultOauthService,
    kmsDataKeyService,
    licenseService,
    agentVaultHookDAL
  };
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

// Rows written before hooks were their own resource still carry these columns until a later release drops them.
const legacyHookedService = (): TAgentVaultServices => ({
  ...sshService({ hasCertificate: false, secret: "key" }),
  hookUrl: "https://hooks.example.com/agent-vault",
  encryptedHookSecret: Buffer.from("sealed")
});

const withSavedHook = (): TAgentVaultServices => ({
  ...sshService({ hasCertificate: false, secret: "key" }),
  hookId: SAVED_HOOK.id,
  hookMethods: null,
  hookPaths: null,
  hookTools: null
});

const noHooksRead = [
  { action: "manage", subject: "all" },
  { action: "read", subject: ProjectPermissionSub.AgentVaultHooks, inverted: true }
];

describe("a service's hook", () => {
  test("setting one writes the hook and its narrowing, checks the plan and tells the audit", async () => {
    const { service, agentVaultServiceDAL, licenseService } = buildService({
      firstRead: plainService(),
      locked: plainService()
    });

    const result = await updateSsh(service, { hook: { name: "approvals" } });

    expect(writtenColumns(agentVaultServiceDAL)).toMatchObject({
      hookId: SAVED_HOOK.id,
      hookMethods: null,
      hookPaths: null,
      hookTools: null
    });
    expect(licenseService.getPlan).toHaveBeenCalled();
    expect(result.update.hookChange).toEqual({ previous: null, current: { id: SAVED_HOOK.id, name: "approvals" } });
    expect(result.service.hook).toEqual({ id: SAVED_HOOK.id, name: "approvals" });
  });

  test("sending the hook it already has checks no plan and isn't a change", async () => {
    const { service, licenseService } = buildService({
      firstRead: withSavedHook(),
      locked: withSavedHook(),
      hooksOnPlan: false
    });

    const result = await updateSsh(service, { hook: { name: "approvals" }, port: 2222 });

    expect(licenseService.getPlan).not.toHaveBeenCalled();
    expect(result.update.hookChange).toBeUndefined();
  });

  test("removing it works off-plan, clears every hook column and names the hook it had", async () => {
    const { service, agentVaultServiceDAL, licenseService } = buildService({
      firstRead: withSavedHook(),
      locked: withSavedHook(),
      hooksOnPlan: false
    });

    const result = await updateSsh(service, { hook: null });

    expect(writtenColumns(agentVaultServiceDAL)).toMatchObject({
      hookId: null,
      hookMethods: null,
      hookPaths: null,
      hookTools: null
    });
    expect(licenseService.getPlan).not.toHaveBeenCalled();
    expect(result.update.hookChange).toEqual({ previous: { id: SAVED_HOOK.id, name: "approvals" }, current: null });
  });

  test("setting one off-plan is refused before the transaction", async () => {
    const { service, agentVaultServiceDAL } = buildService({
      firstRead: plainService(),
      locked: plainService(),
      hooksOnPlan: false
    });

    await expect(updateSsh(service, { hook: { name: "approvals" } })).rejects.toThrow(
      AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
    );
    expect(agentVaultServiceDAL.transaction).not.toHaveBeenCalled();
  });

  test("a name the project has no hook for is a 404 naming it", async () => {
    const { service } = buildService({ firstRead: plainService(), locked: plainService(), savedHooks: [] });

    await expect(updateSsh(service, { hook: { name: "approvals" } })).rejects.toThrow(
      "There's no hook called 'approvals' in this project."
    );
  });

  test("a hook deleted before the save's transaction is a 404 rather than a failed key", async () => {
    const { service, agentVaultHookDAL, agentVaultServiceDAL } = buildService({
      firstRead: plainService(),
      locked: plainService()
    });
    agentVaultHookDAL.findByNameForService.mockResolvedValue(undefined);

    await expect(updateSsh(service, { hook: { name: "approvals" } })).rejects.toThrow(
      "There's no hook called 'approvals' in this project."
    );
    expect(agentVaultServiceDAL.updateById).not.toHaveBeenCalled();
  });

  test("a narrowing an SSH service can't use is refused", async () => {
    const { service } = buildService({ firstRead: plainService(), locked: plainService() });

    await expect(
      updateSsh(service, { hook: { name: "approvals", methods: [AgentVaultHttpMethod.Post] } })
    ).rejects.toThrow(
      "'bastion' is an SSH service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it."
    );
  });

  test("naming one takes read on hooks", async () => {
    const { service } = buildService({ firstRead: plainService(), locked: plainService(), rules: noHooksRead });

    await expect(updateSsh(service, { hook: { name: "approvals" } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("create writes the hook it names", async () => {
    const { service, agentVaultServiceDAL } = buildService({ firstRead: plainService(), locked: plainService() });

    const result = await service.createService({
      projectId: PROJECT_ID,
      ctx,
      type: AgentVaultServiceType.Ssh,
      name: "bastion",
      host: "bastion.internal",
      port: 22,
      credential: { type: AgentVaultCredentialType.Basic, username: "agent", password: "p" },
      hook: { name: "approvals" }
    });

    expect(agentVaultServiceDAL.create.mock.calls[0][0]).toMatchObject({ hookId: SAVED_HOOK.id });
    expect(result.service.hook).toEqual({ id: SAVED_HOOK.id, name: "approvals" });
  });

  test("reads show the hook only to callers who can read hooks, and never a legacy row's old one", async () => {
    const admin = buildService({ firstRead: withSavedHook(), locked: withSavedHook() });
    expect(
      (await admin.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID })).service.hook
    ).toEqual({ id: SAVED_HOOK.id, name: "approvals" });

    const noHooks = buildService({ firstRead: withSavedHook(), locked: withSavedHook(), rules: noHooksRead });
    const hidden = await noHooks.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID });
    expect(hidden.service).not.toHaveProperty("hook");

    const legacy = buildService({ firstRead: legacyHookedService(), locked: legacyHookedService() });
    const read = await legacy.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID });
    expect(read.service.hook).toBeNull();
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

  test("a reference to an OAuth variable is refused, since resolve never puts its tokens in text", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      rules: withReadValue,
      oauthVariableKeys: ["GDRIVE_U123"]
    });

    await expect(create(built.service, "{{GDRIVE_U123}}")).rejects.toThrow("'GDRIVE_U123' is an OAuth variable");
    expect(built.agentVaultServiceDAL.create).not.toHaveBeenCalled();
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

describe("an OAuth credential from an OAuth variable", () => {
  const VARIABLE_A = "variable-GDRIVE_A";
  const VARIABLE_B = "variable-GDRIVE_B";
  const bundleEditor = [
    {
      action: ProjectPermissionAgentVaultAccessBundleActions.Edit,
      subject: ProjectPermissionSub.AgentVaultAccessBundles
    }
  ];

  const usingVariable = (variableId: string, overrides: Partial<TAgentVaultServices> = {}): TAgentVaultServices => ({
    ...plainService(),
    name: "gdrive",
    type: AgentVaultServiceType.Http,
    hostPattern: "www.googleapis.com",
    config: {},
    credentialType: AgentVaultCredentialType.OAuth,
    credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId },
    encryptedCredential: null,
    ...overrides
  });
  const mcpUsingVariable = (variableId: string) =>
    usingVariable(variableId, {
      name: "drive-mcp",
      type: AgentVaultServiceType.Mcp,
      hostPattern: "mcp.example.com",
      config: { serverUrl: "https://mcp.example.com/mcp", transport: AgentVaultMcpTransport.StreamableHttp }
    });

  const createHttp = (service: ReturnType<typeof buildService>["service"], variable?: string) =>
    service.createService({
      projectId: PROJECT_ID,
      ctx,
      type: AgentVaultServiceType.Http,
      name: "gdrive",
      hostPattern: "www.googleapis.com",
      credential: { type: AgentVaultCredentialType.OAuth, ...(variable ? { variable } : {}) }
    });

  test("an HTTP service stores the variable's id, seals nothing, and holds the variable with a reference row", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      oauthVariableKeys: ["GDRIVE_A"],
      oauthVariableTokens: { GDRIVE_A: "variable-access" }
    });

    const { service } = await createHttp(built.service, "GDRIVE_A");

    expect(built.agentVaultServiceDAL.create.mock.calls[0][0]).toMatchObject({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_A },
      encryptedCredential: null,
      memberProvidedFields: null
    });
    expect(built.agentVaultVariableDAL.lockForReference).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, owner: null, variableIds: [VARIABLE_A] },
      expect.anything()
    );
    expect(built.agentVaultServiceVariableReferenceDAL.insertMany.mock.calls[0][0]).toEqual([
      {
        serviceId: SERVICE_ID,
        variableId: VARIABLE_A,
        field: "credential-value",
        customHeaderId: null,
        substitutionId: null
      }
    ]);
    expect(service.credential).toMatchObject({
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      variable: { id: VARIABLE_A, key: "GDRIVE_A" },
      status: "connected",
      issuer: "https://accounts.google.com"
    });
  });

  test("an HTTP service's OAuth comes only from a variable", async () => {
    const built = buildService({ firstRead: plainService(), locked: plainService() });

    await expect(createHttp(built.service)).rejects.toThrow(HTTP_OAUTH_NEEDS_VARIABLE_MESSAGE);
    expect(built.agentVaultServiceDAL.create).not.toHaveBeenCalled();
  });

  test("a key naming a text variable, or nothing, is refused on the variable field", async () => {
    const built = buildService({ firstRead: plainService(), locked: plainService(), variableKeys: ["OPENAI_KEY"] });

    await expect(createHttp(built.service, "OPENAI_KEY")).rejects.toThrow("'OPENAI_KEY' is a text variable");
    await expect(createHttp(built.service, "MISSING")).rejects.toThrow("no global variable named 'MISSING'");
    await expect(createHttp(built.service, "OPENAI_KEY")).rejects.toMatchObject({
      details: { field: "credential.variable" }
    });
    await expect(createHttp(built.service, "MISSING")).rejects.toMatchObject({
      details: { field: "credential.variable" }
    });
    expect(built.agentVaultServiceDAL.create).not.toHaveBeenCalled();
  });

  test("naming a variable needs read-value, checked before the key is looked up", async () => {
    const built = buildService({
      firstRead: plainService(),
      locked: plainService(),
      rules: bundleEditor,
      oauthVariableKeys: ["GDRIVE_A"]
    });

    await expect(createHttp(built.service, "GDRIVE_A")).rejects.toBeInstanceOf(ForbiddenError);
    expect(built.agentVaultVariableDAL.findKeys).not.toHaveBeenCalled();
  });

  test("switching to another variable moves the reference row to it", async () => {
    const built = buildService({
      firstRead: usingVariable(VARIABLE_A),
      locked: usingVariable(VARIABLE_A),
      oauthVariableKeys: ["GDRIVE_A", "GDRIVE_B"]
    });

    const result = await built.service.updateService({
      projectId: PROJECT_ID,
      ctx,
      serviceId: SERVICE_ID,
      type: AgentVaultServiceType.Http,
      credential: { type: AgentVaultCredentialType.OAuth, variable: "GDRIVE_B" }
    });

    expect(writtenColumns(built.agentVaultServiceDAL)).toMatchObject({
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_B },
      encryptedCredential: null
    });
    expect(built.agentVaultServiceVariableReferenceDAL.delete).toHaveBeenCalledWith(
      { serviceId: SERVICE_ID, $in: { field: ["credential-value", "credential-username"] } },
      expect.anything()
    );
    expect(built.agentVaultServiceVariableReferenceDAL.insertMany.mock.calls[0][0]).toEqual([
      {
        serviceId: SERVICE_ID,
        variableId: VARIABLE_B,
        field: "credential-value",
        customHeaderId: null,
        substitutionId: null
      }
    ]);
    expect(result.credentialReplaced).toBe(true);
  });

  test("an edit that leaves the credential alone keeps the reference row", async () => {
    const built = buildService({
      firstRead: usingVariable(VARIABLE_A),
      locked: usingVariable(VARIABLE_A),
      oauthVariableKeys: ["GDRIVE_A"]
    });

    await built.service.updateService({
      projectId: PROJECT_ID,
      ctx,
      serviceId: SERVICE_ID,
      type: AgentVaultServiceType.Http,
      name: "google-drive"
    });

    expect(built.agentVaultServiceVariableReferenceDAL.delete).not.toHaveBeenCalled();
    expect(built.agentVaultServiceVariableReferenceDAL.insertMany).not.toHaveBeenCalled();
  });

  test("an HTTP service sent an OAuth credential with nothing in it keeps its variable", async () => {
    const built = buildService({
      firstRead: usingVariable(VARIABLE_A),
      locked: usingVariable(VARIABLE_A),
      oauthVariableKeys: ["GDRIVE_A"]
    });

    const result = await built.service.updateService({
      projectId: PROJECT_ID,
      ctx,
      serviceId: SERVICE_ID,
      type: AgentVaultServiceType.Http,
      name: "google-drive",
      credential: { type: AgentVaultCredentialType.OAuth }
    });

    expect(writtenColumns(built.agentVaultServiceDAL)).not.toHaveProperty("credentialConfig");
    expect(built.agentVaultServiceVariableReferenceDAL.delete).not.toHaveBeenCalled();
    expect(result.credentialReplaced).toBe(false);
  });

  test("an MCP service using a variable can move to another server without authorizing again", async () => {
    const built = buildService({
      firstRead: mcpUsingVariable(VARIABLE_A),
      locked: mcpUsingVariable(VARIABLE_A),
      oauthVariableKeys: ["GDRIVE_A"]
    });

    await built.service.updateService({
      projectId: PROJECT_ID,
      ctx,
      serviceId: SERVICE_ID,
      type: AgentVaultServiceType.Mcp,
      serverUrl: "https://mcp2.example.com/mcp"
    });

    expect(writtenColumns(built.agentVaultServiceDAL).config).toMatchObject({
      serverUrl: "https://mcp2.example.com/mcp"
    });
  });

  test("a member reads the variable's id and key only with read on variables", async () => {
    const reader = buildService({
      firstRead: usingVariable(VARIABLE_A),
      locked: usingVariable(VARIABLE_A),
      member: true,
      oauthVariableKeys: ["GDRIVE_A"],
      oauthVariableTokens: { GDRIVE_A: "variable-access" }
    });

    const { service } = await reader.service.getService({ projectId: PROJECT_ID, ctx, serviceId: SERVICE_ID });

    expect(service.credential).toMatchObject({ type: AgentVaultCredentialType.OAuth, source: "variable" });
    expect(service.credential).not.toHaveProperty("variable", expect.anything());
    expect(service.credential).not.toHaveProperty("lastError", expect.anything());
  });

  const listUnsavedWithVariable = (built: ReturnType<typeof buildService>, extra: Record<string, unknown> = {}) =>
    built.service.listMcpTools({
      projectId: PROJECT_ID,
      ctx,
      serverUrl: "https://mcp.example.com/mcp",
      transport: AgentVaultMcpTransport.StreamableHttp,
      credential: { type: AgentVaultCredentialType.OAuth, variable: "GDRIVE_A" },
      ...extra
    });
  const unsavedWithVariable = () =>
    buildService({
      firstRead: plainService(),
      locked: plainService(),
      oauthVariableKeys: ["GDRIVE_A"],
      oauthVariableTokens: { GDRIVE_A: "variable-access" }
    });
  const rejected = () => Object.assign(new McpListError({ message: "rejected" }), { isCredentialRejected: true });

  test("tools load with an unsaved service's variable token, refreshed through the variable alone", async () => {
    listMcpServerTools.mockResolvedValueOnce([{ name: "search" }]);
    const built = unsavedWithVariable();

    const result = await listUnsavedWithVariable(built);

    expect(result.tools).toEqual([{ name: "search" }]);
    expect(built.agentVaultOauthService.refreshVariableToken).toHaveBeenCalledWith({
      variableId: VARIABLE_A,
      projectId: PROJECT_ID,
      expiresWithinSeconds: 60,
      rejectedTokenHash: undefined
    });
    expect(built.agentVaultOauthService.refreshServiceToken).not.toHaveBeenCalled();
    expect((listMcpServerTools.mock.lastCall![0] as { headers: unknown }).headers).toEqual({
      Authorization: "Bearer variable-refreshed-access"
    });
  });

  test("an unsaved service's variable token refused by the server is refreshed once and retried", async () => {
    listMcpServerTools.mockRejectedValueOnce(rejected()).mockResolvedValueOnce([{ name: "search" }]);
    const built = unsavedWithVariable();
    built.agentVaultOauthService.refreshVariableToken.mockImplementation(async ({ rejectedTokenHash }) => ({
      credential: { value: rejectedTokenHash ? "after-rejection" : "variable-refreshed-access" },
      status: "connected"
    }));

    const result = await listUnsavedWithVariable(built);

    expect(result.tools).toEqual([{ name: "search" }]);
    expect(built.agentVaultOauthService.refreshVariableToken).toHaveBeenLastCalledWith(
      expect.objectContaining({ rejectedTokenHash: hashAccessToken("variable-refreshed-access") })
    );
    expect((listMcpServerTools.mock.lastCall![0] as { headers: unknown }).headers).toEqual({
      Authorization: "Bearer after-rejection"
    });
  });

  test("a refusal with a typed custom header beside the variable's token doesn't refresh it", async () => {
    listMcpServerTools.mockRejectedValueOnce(rejected());
    const built = unsavedWithVariable();

    await expect(
      listUnsavedWithVariable(built, { customHeaders: [{ name: "X-Workspace", value: "acme" }] })
    ).rejects.toThrow("rejected");
    expect(built.agentVaultOauthService.refreshVariableToken).toHaveBeenCalledTimes(1);
  });

  test("tools for a saved service load with the variable's token, refreshed through the service", async () => {
    listMcpServerTools.mockResolvedValueOnce([{ name: "search" }]);
    const built = buildService({
      firstRead: mcpUsingVariable(VARIABLE_A),
      locked: mcpUsingVariable(VARIABLE_A),
      oauthVariableKeys: ["GDRIVE_A"],
      oauthVariableTokens: { GDRIVE_A: "variable-access" }
    });

    await built.service.listMcpTools({
      projectId: PROJECT_ID,
      ctx,
      serviceId: SERVICE_ID,
      serverUrl: "https://mcp.example.com/mcp",
      transport: AgentVaultMcpTransport.StreamableHttp
    });

    expect(built.agentVaultOauthService.refreshServiceToken).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: SERVICE_ID, variableId: VARIABLE_A })
    );
    expect((listMcpServerTools.mock.lastCall![0] as { headers: unknown }).headers).toEqual({
      Authorization: "Bearer refreshed-access"
    });
  });

  test("tools can't load with a variable that isn't connected", async () => {
    const built = buildService({ firstRead: plainService(), locked: plainService(), oauthVariableKeys: ["GDRIVE_A"] });

    await expect(
      built.service.listMcpTools({
        projectId: PROJECT_ID,
        ctx,
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.StreamableHttp,
        credential: { type: AgentVaultCredentialType.OAuth, variable: "GDRIVE_A" }
      })
    ).rejects.toThrow("The OAuth variable 'GDRIVE_A' isn't connected");
  });
});
