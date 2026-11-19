import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ConflictError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultHttpMethod } from "../agent-vault/agent-vault-enums";
import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "./agent-vault-hook-fns";
import { agentVaultHookServiceFactory } from "./agent-vault-hook-service";

const PROJECT_ID = "project-1";
const HOOK_ID = "00000000-0000-4000-8000-0000000000aa";
const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);
const GITHUB_ID = "11111111-1111-4111-8111-111111111111";
const projectServices = [{ id: GITHUB_ID, name: "github" }];

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as Parameters<ReturnType<typeof agentVaultHookServiceFactory>["createHook"]>[0]["ctx"];

const storedHook = {
  id: HOOK_ID,
  projectId: PROJECT_ID,
  sessionId: null,
  name: "approvals",
  description: null,
  url: HOOK_URL,
  rules: [{ serviceId: GITHUB_ID, methods: ["PUT"] }],
  secretsDeletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

const sealed = (secret: string) =>
  Buffer.concat([Buffer.from("sealed:"), Buffer.from(JSON.stringify({ value: secret }))]);

const buildService = ({
  hooksOnPlan = true,
  rules = [{ action: "manage", subject: "all" }],
  existingByName,
  stored = storedHook
}: {
  hooksOnPlan?: boolean;
  rules?: RawRuleOf<MongoAbility>[];
  existingByName?: typeof storedHook;
  // null for a hook that isn't the project's.
  stored?: typeof storedHook | null;
} = {}) => {
  const agentVaultHookDAL = {
    findForList: vi.fn().mockResolvedValue({ hooks: [storedHook], totalCount: 1 }),
    findSavedByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    findSavedByNameInProject: vi.fn().mockResolvedValue(existingByName),
    lockSavedByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    create: vi.fn(async (row: Record<string, unknown>) => ({
      ...storedHook,
      ...row,
      rules: JSON.parse(row.rules as string) as unknown
    })),
    updateById: vi.fn(async (_id: string, row: Record<string, unknown>) => ({
      ...storedHook,
      ...row,
      rules: row.rules ? (JSON.parse(row.rules as string) as unknown) : storedHook.rules
    })),
    deleteById: vi.fn(),
    findProjectServicesForHookRules: vi.fn(async ({ ids = [], names = [] }: { ids?: string[]; names?: string[] }) =>
      projectServices.filter((service) => ids.includes(service.id) || names.includes(service.name))
    ),
    findHookRuleServiceNames: vi.fn(
      async ({ ids }: { ids: string[] }) =>
        new Map(
          projectServices.filter((service) => ids.includes(service.id)).map((service) => [service.id, service.name])
        )
    ),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
  };
  const licenseService = {
    getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: hooksOnPlan }))
  };
  const kmsDataKeyService = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
      })
    })
  };
  const service = agentVaultHookServiceFactory({
    agentVaultHookDAL,
    licenseService,
    kmsDataKeyService,
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(rules),
        hasRole: () => true,
        memberships: []
      })
    }
  } as unknown as Parameters<typeof agentVaultHookServiceFactory>[0]);
  return { service, agentVaultHookDAL, licenseService };
};

const memberRules: RawRuleOf<MongoAbility>[] = [{ action: "read", subject: "agent-vault-hooks" }];

describe("createHook", () => {
  test("seals the secret, stores the rules as JSON and never returns the secret", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.createHook({
      projectId: PROJECT_ID,
      ctx,
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET,
      rules: [{ service: "linear", tools: ["delete_issue"] }]
    });

    expect(agentVaultHookDAL.create).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      name: "approvals",
      description: null,
      url: HOOK_URL,
      encryptedSecret: sealed(SECRET),
      rules: JSON.stringify([{ service: "linear", tools: ["delete_issue"] }])
    });
    expect(result.hook).toMatchObject({ name: "approvals", rules: [{ service: "linear", tools: ["delete_issue"] }] });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.hook).not.toHaveProperty("encryptedSecret");
  });

  test("a rule naming a project service is stored by the service's ID and read back with its name", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.createHook({
      projectId: PROJECT_ID,
      ctx,
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET,
      rules: [{ service: "github", methods: [AgentVaultHttpMethod.Put] }, { service: "inline-api" }]
    });

    expect(agentVaultHookDAL.create.mock.calls[0][0].rules).toBe(
      JSON.stringify([{ serviceId: GITHUB_ID, methods: ["PUT"] }, { service: "inline-api" }])
    );
    expect(result.hook.rules).toEqual([
      { serviceId: GITHUB_ID, service: "github", methods: ["PUT"] },
      { serviceId: null, service: "inline-api" }
    ]);
  });

  test("a rule on a service ID that isn't the project's is a 404", async () => {
    const { service, agentVaultHookDAL } = buildService();
    const otherId = "22222222-2222-4222-8222-222222222222";

    await expect(
      service.createHook({
        projectId: PROJECT_ID,
        ctx,
        name: "approvals",
        url: HOOK_URL,
        secret: SECRET,
        rules: [{ serviceId: otherId }]
      })
    ).rejects.toThrow(
      new NotFoundError({ message: `Rule 1 names a service with ID '${otherId}' that isn't in this project.` })
    );
    expect(agentVaultHookDAL.create).not.toHaveBeenCalled();
  });

  test("is refused with hooks off the plan", async () => {
    const { service, agentVaultHookDAL } = buildService({ hooksOnPlan: false });

    await expect(
      service.createHook({ projectId: PROJECT_ID, ctx, name: "approvals", url: HOOK_URL, secret: SECRET })
    ).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    expect(agentVaultHookDAL.create).not.toHaveBeenCalled();
  });

  test("refuses a name the project already has", async () => {
    const { service } = buildService({ existingByName: storedHook });

    await expect(
      service.createHook({ projectId: PROJECT_ID, ctx, name: "Approvals", url: HOOK_URL, secret: SECRET })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test("a member can't create one", async () => {
    const { service } = buildService({ rules: memberRules });

    await expect(
      service.createHook({ projectId: PROJECT_ID, ctx, name: "approvals", url: HOOK_URL, secret: SECRET })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("updateHook", () => {
  test("leaving out the secret keeps the stored one", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, url: HOOK_URL, rules: [] });

    const written = agentVaultHookDAL.updateById.mock.calls[0][1];
    expect(written).not.toHaveProperty("encryptedSecret");
    expect(written).toEqual({ url: HOOK_URL, rules: "[]" });
    expect(result.secretReplaced).toBe(false);
  });

  test("a new secret is sealed and reported as replaced", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, secret: SECRET });

    expect(agentVaultHookDAL.updateById.mock.calls[0][1]).toEqual({ encryptedSecret: sealed(SECRET) });
    expect(result.secretReplaced).toBe(true);
  });

  test("with hooks off the plan, the URL, secret and rules can't change but the name can", async () => {
    const off = () => buildService({ hooksOnPlan: false });
    const update = (fields: Record<string, unknown>) =>
      off().service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, ...fields });

    await expect(update({ url: "https://hooks.example.com/other" })).rejects.toThrow(
      AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
    );
    await expect(update({ secret: SECRET })).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    await expect(update({ rules: [] })).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);

    const renamed = off();
    await renamed.service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, name: "gate", url: HOOK_URL });
    expect(renamed.licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("a hook deleted while the update waited is a 404", async () => {
    const { service, agentVaultHookDAL } = buildService();
    agentVaultHookDAL.lockSavedByIdInProject.mockResolvedValue(undefined);

    await expect(
      service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, name: "gate" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(agentVaultHookDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("deleteHook and reads", () => {
  test("delete never checks the plan", async () => {
    const { service, agentVaultHookDAL, licenseService } = buildService({ hooksOnPlan: false });

    const result = await service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID });

    expect(agentVaultHookDAL.deleteById).toHaveBeenCalledWith(HOOK_ID, expect.anything());
    expect(result.hook.id).toBe(HOOK_ID);
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("a member reads hooks without the plan and can't delete them", async () => {
    const { service, licenseService } = buildService({ rules: memberRules, hooksOnPlan: false });

    const list = await service.listHooks({ projectId: PROJECT_ID, ctx, limit: 20, offset: 0 });
    expect(list.hooks[0]).toMatchObject({
      id: HOOK_ID,
      url: HOOK_URL,
      rules: [{ serviceId: GITHUB_ID, service: "github", methods: ["PUT"] }]
    });
    expect((await service.getHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).hook.id).toBe(HOOK_ID);
    expect(licenseService.getPlan).not.toHaveBeenCalled();

    await expect(service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  test("a hook that isn't the project's is a 404 that echoes the id", async () => {
    const { service } = buildService({ stored: null });

    await expect(service.getHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).rejects.toThrow(
      `Hook with ID '${HOOK_ID}' not found`
    );
  });
});
