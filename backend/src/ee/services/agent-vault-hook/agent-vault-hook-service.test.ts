import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ConflictError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultHttpMethod, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "./agent-vault-hook-fns";
import { agentVaultHookServiceFactory } from "./agent-vault-hook-service";

const PROJECT_ID = "project-1";
const HOOK_ID = "00000000-0000-4000-8000-0000000000aa";
const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);
const GITHUB_ID = "11111111-1111-4111-8111-111111111111";
const LINEAR_ID = "22222222-2222-4222-8222-222222222222";
const projectServices = [
  { id: GITHUB_ID, name: "github", type: AgentVaultServiceType.Http },
  { id: LINEAR_ID, name: "linear", type: AgentVaultServiceType.Mcp }
];

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
  appliesToAllServices: false,
  secretsDeletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

const sealed = (secret: string) =>
  Buffer.concat([Buffer.from("sealed:"), Buffer.from(JSON.stringify({ value: secret }))]);

type TLink = { hookId: string; serviceId: string; position: number; methods: unknown; paths: unknown; tools: unknown };

const githubLink: TLink = {
  hookId: HOOK_ID,
  serviceId: GITHUB_ID,
  position: 0,
  methods: ["PUT"],
  paths: null,
  tools: null
};

const buildService = ({
  hooksOnPlan = true,
  rules = [{ action: "manage", subject: "all" }],
  existingByName,
  stored = storedHook,
  links: initialLinks = [githubLink]
}: {
  links?: TLink[];
  hooksOnPlan?: boolean;
  rules?: RawRuleOf<MongoAbility>[];
  existingByName?: typeof storedHook;
  // null for a hook that isn't the project's.
  stored?: typeof storedHook | null;
} = {}) => {
  let links = [...initialLinks];
  const withService = (link: TLink) => {
    const service = projectServices.find((candidate) => candidate.id === link.serviceId)!;
    return { ...link, serviceName: service.name, serviceType: service.type };
  };
  const agentVaultHookDAL = {
    findForList: vi.fn().mockResolvedValue({ hooks: [storedHook], totalCount: 1 }),
    findSavedByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    findSavedByNameInProject: vi.fn().mockResolvedValue(existingByName),
    lockSavedByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    create: vi.fn(async (row: Record<string, unknown>) => ({ ...storedHook, ...row })),
    updateById: vi.fn(async (_id: string, row: Record<string, unknown>) => ({ ...storedHook, ...row })),
    deleteById: vi.fn(),
    lockProjectServicesForHook: vi.fn(async ({ names }: { names: string[] }) =>
      projectServices.filter((service) => names.includes(service.name))
    ),
    replaceHookServiceLinks: vi.fn(
      async (
        hookId: string,
        next: { serviceId: string; position: number; methods: unknown; paths: unknown; tools: unknown }[]
      ) => {
        links = [...links.filter((link) => link.hookId !== hookId), ...next.map((link) => ({ ...link, hookId }))];
      }
    ),
    findHookServiceLinks: vi.fn(async (hookIds: string[]) =>
      links.filter((link) => hookIds.includes(link.hookId)).map(withService)
    ),
    lockHookServiceLink: vi.fn(async ({ hookId, serviceId }: { hookId: string; serviceId: string }) => {
      const link = links.find((candidate) => candidate.hookId === hookId && candidate.serviceId === serviceId);
      return link ? withService(link) : undefined;
    }),
    countHookServiceLinks: vi.fn(async () => 1),
    insertHookServiceLink: vi.fn(),
    updateHookServiceLink: vi.fn(),
    deleteHookServiceLink: vi.fn(),
    findSavedHooksOfService: vi
      .fn()
      .mockResolvedValue([{ id: HOOK_ID, name: "approvals", methods: ["PUT"], paths: null, tools: null }]),
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
  test("seals the secret, links the named services and never returns the secret", async () => {
    const { service, agentVaultHookDAL } = buildService({ links: [] });

    const result = await service.createHook({
      projectId: PROJECT_ID,
      ctx,
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET,
      rules: [
        { service: "linear", tools: ["delete_issue"] },
        { service: "github", methods: [AgentVaultHttpMethod.Put] }
      ]
    });

    expect(agentVaultHookDAL.create).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        name: "approvals",
        description: null,
        url: HOOK_URL,
        encryptedSecret: sealed(SECRET),
        appliesToAllServices: false
      },
      expect.anything()
    );
    expect(agentVaultHookDAL.replaceHookServiceLinks).toHaveBeenCalledWith(
      HOOK_ID,
      [
        { serviceId: LINEAR_ID, position: 0, methods: null, paths: null, tools: ["delete_issue"] },
        { serviceId: GITHUB_ID, position: 1, methods: ["PUT"], paths: null, tools: null }
      ],
      expect.anything()
    );
    expect(result.hook.rules).toEqual([
      { service: "linear", tools: ["delete_issue"] },
      { service: "github", methods: ["PUT"] }
    ]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.hook).not.toHaveProperty("encryptedSecret");
  });

  test("a hook saved without rules applies to every service", async () => {
    const { service, agentVaultHookDAL } = buildService({ links: [] });

    const result = await service.createHook({ projectId: PROJECT_ID, ctx, name: "all", url: HOOK_URL, secret: SECRET });

    expect(agentVaultHookDAL.create.mock.calls[0][0]).toMatchObject({ appliesToAllServices: true });
    expect(result.hook).toMatchObject({ rules: [], appliesToAllServices: true });
  });

  test("a rule naming a service that isn't the project's is a 404 naming it", async () => {
    const { service, agentVaultHookDAL } = buildService({ links: [] });

    await expect(
      service.createHook({
        projectId: PROJECT_ID,
        ctx,
        name: "approvals",
        url: HOOK_URL,
        secret: SECRET,
        rules: [{ service: "github" }, { service: "inline-api" }]
      })
    ).rejects.toThrow(
      new NotFoundError({
        message:
          "There's no service called 'inline-api' in this project. A hook rule can only name one of the project's services."
      })
    );
    expect(agentVaultHookDAL.replaceHookServiceLinks).not.toHaveBeenCalled();
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
  test("leaving out the secret keeps the stored one, and empty rules apply to every service", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, url: HOOK_URL, rules: [] });

    const written = agentVaultHookDAL.updateById.mock.calls[0][1];
    expect(written).not.toHaveProperty("encryptedSecret");
    expect(written).toEqual({ url: HOOK_URL, appliesToAllServices: true });
    expect(agentVaultHookDAL.replaceHookServiceLinks).toHaveBeenCalledWith(HOOK_ID, [], expect.anything());
    expect(result.hook.rules).toEqual([]);
    expect(result.secretReplaced).toBe(false);
  });

  test("rules left out keep the hook's services", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, name: "gate" });

    expect(agentVaultHookDAL.replaceHookServiceLinks).not.toHaveBeenCalled();
    expect(agentVaultHookDAL.updateById.mock.calls[0][1]).toEqual({ name: "gate" });
    expect(result.hook.rules).toEqual([{ service: "github", methods: ["PUT"] }]);
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

describe("a hook's services, one at a time", () => {
  const byId = { projectId: PROJECT_ID, ctx, hookId: HOOK_ID };

  test("adds a project service by name, after the hook's last rule, and the hook stops applying to everything", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.addHookService({ ...byId, service: "linear", tools: ["delete_issue"] });

    expect(agentVaultHookDAL.insertHookServiceLink).toHaveBeenCalledWith(
      {
        hookId: HOOK_ID,
        link: { serviceId: LINEAR_ID, methods: null, paths: null, tools: ["delete_issue"] }
      },
      expect.anything()
    );
    expect(agentVaultHookDAL.updateById).toHaveBeenCalledWith(
      HOOK_ID,
      { appliesToAllServices: false },
      expect.anything()
    );
    expect(result).toEqual({
      hook: { id: HOOK_ID, name: "approvals" },
      service: { id: LINEAR_ID, name: "linear" },
      tools: ["delete_issue"]
    });
  });

  test("adding a service the hook already has is a conflict", async () => {
    const { service, agentVaultHookDAL } = buildService();

    await expect(service.addHookService({ ...byId, service: "github" })).rejects.toThrow(
      "'github' is already in hook 'approvals'. Change what it checks instead of adding it again."
    );
    expect(agentVaultHookDAL.insertHookServiceLink).not.toHaveBeenCalled();
  });

  test("adding a name that isn't a project service is a 404", async () => {
    const { service } = buildService();

    await expect(service.addHookService({ ...byId, service: "inline-api" })).rejects.toThrow(
      "There's no service called 'inline-api' in this project."
    );
  });

  test("a narrowing that doesn't fit the service's type is refused", async () => {
    const { service, agentVaultHookDAL } = buildService();

    await expect(
      service.addHookService({ ...byId, service: "linear", methods: [AgentVaultHttpMethod.Get] })
    ).rejects.toThrow("'linear' is an MCP service, and only an HTTP service can be narrowed by methods or paths.");
    await expect(
      service.updateHookService({ ...byId, serviceId: GITHUB_ID, methods: null, tools: ["x"] })
    ).rejects.toThrow("only an MCP service can be narrowed by tools");
    expect(agentVaultHookDAL.updateHookServiceLink).not.toHaveBeenCalled();
  });

  test("a narrowing PATCH keeps fields left out and clears fields sent as null", async () => {
    const { service, agentVaultHookDAL } = buildService({ links: [{ ...githubLink, paths: ["/repos"] }] });

    const result = await service.updateHookService({ ...byId, serviceId: GITHUB_ID, methods: null });

    expect(agentVaultHookDAL.updateHookServiceLink).toHaveBeenCalledWith(
      { hookId: HOOK_ID, serviceId: GITHUB_ID, link: { methods: null, paths: ["/repos"], tools: null } },
      expect.anything()
    );
    expect(result).toMatchObject({ service: { id: GITHUB_ID, name: "github" }, paths: ["/repos"] });
    expect(result).not.toHaveProperty("methods");
  });

  test("removing or narrowing a service the hook doesn't have is a 404", async () => {
    const { service } = buildService();

    await expect(service.removeHookService({ ...byId, serviceId: LINEAR_ID })).rejects.toThrow(
      `Service with ID '${LINEAR_ID}' isn't in hook 'approvals'.`
    );
    await expect(service.updateHookService({ ...byId, serviceId: LINEAR_ID, tools: null })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  test("removes a service and reports what the hook checked of it", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.removeHookService({ ...byId, serviceId: GITHUB_ID });

    expect(agentVaultHookDAL.deleteHookServiceLink).toHaveBeenCalledWith(
      { hookId: HOOK_ID, serviceId: GITHUB_ID },
      expect.anything()
    );
    expect(result).toEqual({
      hook: { id: HOOK_ID, name: "approvals" },
      service: { id: GITHUB_ID, name: "github" },
      methods: ["PUT"]
    });
  });

  test("adding past the hook's service limit is refused", async () => {
    const { service, agentVaultHookDAL } = buildService();
    agentVaultHookDAL.countHookServiceLinks.mockResolvedValue(50);

    await expect(service.addHookService({ ...byId, service: "linear" })).rejects.toThrow(
      "Hook 'approvals' already checks 50 services, the most a hook can have. Remove one before adding 'linear'."
    );
    expect(agentVaultHookDAL.insertHookServiceLink).not.toHaveBeenCalled();
  });

  test("each edit needs Edit on hooks, and adding or narrowing needs the plan", async () => {
    await expect(
      buildService({ rules: memberRules }).service.removeHookService({ ...byId, serviceId: GITHUB_ID })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      buildService({ hooksOnPlan: false }).service.addHookService({ ...byId, service: "linear" })
    ).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    await expect(
      buildService({ hooksOnPlan: false }).service.updateHookService({ ...byId, serviceId: GITHUB_ID, methods: null })
    ).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
  });

  test("removing a service works off-plan", async () => {
    const { service, agentVaultHookDAL } = buildService({ hooksOnPlan: false });

    await service.removeHookService({ ...byId, serviceId: GITHUB_ID });

    expect(agentVaultHookDAL.deleteHookServiceLink).toHaveBeenCalled();
  });

  test("a service's hooks are read only by callers who can read hooks", async () => {
    const scope = { projectId: PROJECT_ID, ctx, serviceId: GITHUB_ID };
    expect(await buildService({ rules: memberRules }).service.listServiceHooks(scope)).toEqual([
      { id: HOOK_ID, name: "approvals", methods: ["PUT"] }
    ]);
    expect(await buildService({ rules: [] }).service.listServiceHooks(scope)).toBeUndefined();
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
      rules: [{ service: "github", methods: ["PUT"] }],
      appliesToAllServices: false
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
