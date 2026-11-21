import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ConflictError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "./agent-vault-hook-fns";
import { agentVaultHookServiceFactory } from "./agent-vault-hook-service";

const PROJECT_ID = "project-1";
const HOOK_ID = "00000000-0000-4000-8000-0000000000aa";
const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);
const GITHUB = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "github",
  type: "http",
  hostPattern: "api.github.com"
};
const LINEAR = { id: "22222222-2222-4222-8222-222222222222", name: "linear", type: "mcp", hostPattern: null };

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as Parameters<ReturnType<typeof agentVaultHookServiceFactory>["createHook"]>[0]["ctx"];

const storedHook = {
  id: HOOK_ID,
  projectId: PROJECT_ID,
  name: "approvals",
  description: null,
  url: HOOK_URL,
  createdAt: new Date(),
  updatedAt: new Date()
};

const sealed = (secret: string) =>
  Buffer.concat([Buffer.from("sealed:"), Buffer.from(JSON.stringify({ value: secret }))]);

const buildService = ({
  hooksOnPlan = true,
  rules = [{ action: "manage", subject: "all" }],
  existingByName,
  stored = storedHook,
  usedBy = [LINEAR, GITHUB],
  reachesEveryBundle = true
}: {
  hooksOnPlan?: boolean;
  rules?: RawRuleOf<MongoAbility>[];
  existingByName?: typeof storedHook;
  // null for a hook that isn't the project's.
  stored?: typeof storedHook | null;
  usedBy?: { id: string; name: string; type: string; hostPattern: string | null }[];
  reachesEveryBundle?: boolean;
} = {}) => {
  const tx = { raw: vi.fn() };
  const agentVaultHookDAL = {
    findForList: vi.fn().mockResolvedValue({ hooks: [storedHook], totalCount: 1 }),
    findByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    findByNameInProject: vi.fn().mockResolvedValue(existingByName),
    lockByIdInProject: vi.fn().mockResolvedValue(stored ?? undefined),
    create: vi.fn(async (row: Record<string, unknown>) => ({ ...storedHook, ...row })),
    updateById: vi.fn(async (_id: string, row: Record<string, unknown>) => ({ ...storedHook, ...row })),
    deleteById: vi.fn(),
    findUsedBy: vi.fn(async (hookIds: string[]) => new Map(hookIds.map((id) => [id, usedBy]))),
    lockServicesUsingHook: vi.fn().mockResolvedValue(usedBy),
    detachFromServices: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx))
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
        hasRole: () => reachesEveryBundle,
        memberships: []
      })
    },
    membershipDAL: {
      findResourceMembershipsForActor: vi
        .fn()
        .mockResolvedValue([{ isActive: true, actorGroupId: null, scopeResourceId: "bundle-granted" }])
    }
  } as unknown as Parameters<typeof agentVaultHookServiceFactory>[0]);
  return { service, agentVaultHookDAL, licenseService, tx };
};

const memberRules: RawRuleOf<MongoAbility>[] = [{ action: "read", subject: "agent-vault-hooks" }];

describe("createHook", () => {
  test("seals the secret and never returns it, and a new hook is used by nothing", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.createHook({
      projectId: PROJECT_ID,
      ctx,
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET
    });

    expect(agentVaultHookDAL.create).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      name: "approvals",
      description: null,
      url: HOOK_URL,
      encryptedSecret: sealed(SECRET)
    });
    expect(result.hook).toMatchObject({ id: HOOK_ID, projectId: PROJECT_ID, usedBy: [] });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.hook).not.toHaveProperty("encryptedSecret");
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

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, url: HOOK_URL });

    const written = agentVaultHookDAL.updateById.mock.calls[0][1];
    expect(written).toEqual({ url: HOOK_URL });
    expect(result.secretReplaced).toBe(false);
    expect(result.hook.usedBy).toEqual([LINEAR, GITHUB]);
  });

  test("a new secret is sealed and reported as replaced", async () => {
    const { service, agentVaultHookDAL } = buildService();

    const result = await service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, secret: SECRET });

    expect(agentVaultHookDAL.updateById.mock.calls[0][1]).toEqual({ encryptedSecret: sealed(SECRET) });
    expect(result.secretReplaced).toBe(true);
  });

  test("with hooks off the plan, the URL and secret can't change but the name and description can", async () => {
    const off = () => buildService({ hooksOnPlan: false });
    const update = (fields: Record<string, unknown>) =>
      off().service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, ...fields });

    await expect(update({ url: "https://hooks.example.com/other" })).rejects.toThrow(
      AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
    );
    await expect(update({ secret: SECRET })).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);

    const renamed = off();
    await renamed.service.updateHook({
      projectId: PROJECT_ID,
      ctx,
      hookId: HOOK_ID,
      name: "gate",
      description: "Asks before deploys",
      url: HOOK_URL
    });
    expect(renamed.licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("a rename to a name another hook has is a conflict", async () => {
    const { service } = buildService({ existingByName: { ...storedHook, id: "other" } });

    await expect(
      service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, name: "taken" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test("a hook deleted while the update waited is a 404", async () => {
    const { service, agentVaultHookDAL } = buildService();
    agentVaultHookDAL.lockByIdInProject.mockResolvedValue(undefined);

    await expect(
      service.updateHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID, name: "gate" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(agentVaultHookDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("deleteHook", () => {
  test("works while services use it, takes it off them and names them, without checking the plan", async () => {
    const { service, agentVaultHookDAL, licenseService } = buildService({ hooksOnPlan: false });

    const result = await service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID });

    expect(agentVaultHookDAL.detachFromServices).toHaveBeenCalledWith([LINEAR.id, GITHUB.id], expect.anything());
    expect(agentVaultHookDAL.deleteById).toHaveBeenCalledWith(HOOK_ID, expect.anything());
    expect(result.hook.usedBy).toEqual([GITHUB, LINEAR]);
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("takes the project's service-names lock, then locks the services using it before the hook, then reads them again under the hook's lock", async () => {
    const { service, agentVaultHookDAL, tx } = buildService();

    await service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID });

    expect(tx.raw.mock.invocationCallOrder[0]).toBeLessThan(
      agentVaultHookDAL.lockServicesUsingHook.mock.invocationCallOrder[0]
    );

    const servicesLocked = agentVaultHookDAL.lockServicesUsingHook.mock.invocationCallOrder;
    const hookLocked = agentVaultHookDAL.lockByIdInProject.mock.invocationCallOrder[0];
    expect(servicesLocked[0]).toBeLessThan(hookLocked);
    expect(servicesLocked[1]).toBeGreaterThan(hookLocked);
  });

  test("a hook that isn't the project's is a 404", async () => {
    const { service, agentVaultHookDAL } = buildService({ stored: null });

    await expect(service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(agentVaultHookDAL.deleteById).not.toHaveBeenCalled();
  });
});

describe("reads", () => {
  test("a member reads hooks with the services using them, without the plan, and can't delete them", async () => {
    const { service, licenseService } = buildService({ rules: memberRules, hooksOnPlan: false });

    const list = await service.listHooks({ projectId: PROJECT_ID, ctx, limit: 20, offset: 0 });
    expect(list.hooks[0]).toMatchObject({ id: HOOK_ID, url: HOOK_URL, usedBy: [LINEAR, GITHUB] });
    expect((await service.getHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).hook.id).toBe(HOOK_ID);
    expect(licenseService.getPlan).not.toHaveBeenCalled();

    await expect(service.deleteHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  test("usedBy lists only the services in bundles the caller reaches, and every service for one who reaches all", async () => {
    const member = buildService({ rules: memberRules, reachesEveryBundle: false });
    await member.service.listHooks({ projectId: PROJECT_ID, ctx, limit: 20, offset: 0 });
    expect(member.agentVaultHookDAL.findUsedBy).toHaveBeenCalledWith([HOOK_ID], ["bundle-granted"], undefined);

    const admin = buildService();
    await admin.service.getHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID });
    expect(admin.agentVaultHookDAL.findUsedBy).toHaveBeenCalledWith([HOOK_ID], null, undefined);
  });

  test("a hook that isn't the project's is a 404 that echoes the id", async () => {
    const { service } = buildService({ stored: null });

    await expect(service.getHook({ projectId: PROJECT_ID, ctx, hookId: HOOK_ID })).rejects.toThrow(
      `Hook with ID '${HOOK_ID}' not found`
    );
  });
});
