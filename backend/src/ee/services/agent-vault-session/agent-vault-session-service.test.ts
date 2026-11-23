import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "../agent-vault-hook/agent-vault-hook-fns";
import { sha256Hex } from "../agent-vault-skill/agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "../agent-vault-skill/agent-vault-skill-types";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultInlineServiceInsert } from "./agent-vault-session-inline-service-dal";
import { TAgentVaultInlineSkillInsert } from "./agent-vault-session-inline-skill-dal";
import { agentVaultSessionServiceFactory } from "./agent-vault-session-service";
import { TAgentVaultSessionServiceSummary, TMintSessionDTO } from "./agent-vault-session-types";

const PROJECT_ID = "project-1";
const HOOK_ID = "00000000-0000-4000-8000-0000000000aa";

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as TMintSessionDTO["ctx"];

const VARIABLE_ID = "77777777-7777-4777-8777-777777777777";

const inlineCredentialOf = (service: TAgentVaultSessionServiceSummary) => {
  if (!service.isInline) throw new Error(`Expected '${service.name}' to be an inline service`);
  return service.credential;
};

const buildService = ({
  rules = [{ action: "manage", subject: "all" }],
  savedHooks = [{ id: HOOK_ID, name: "approvals" }],
  hooksOnPlan = true
}: {
  rules?: { action: string; subject: string; inverted?: boolean }[];
  savedHooks?: { id: string; name: string }[];
  hooksOnPlan?: boolean;
} = {}) => {
  const findKeys = vi.fn().mockResolvedValue([{ id: VARIABLE_ID, key: "GDRIVE_U123", type: "oauth" }]);
  const findOauthForResolve = vi
    .fn()
    .mockResolvedValue([{ id: VARIABLE_ID, key: "GDRIVE_U123", encryptedValue: null, oauthConfig: {} }]);
  const insertForSession = vi.fn(async ({ services }: { services: TAgentVaultInlineServiceInsert[] }) =>
    services.map((row) => ({
      ...row,
      id: `inline-${row.position}`,
      sessionId: "session-1",
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  );
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ raw: vi.fn() }));
  const findByNamesForService = vi.fn(async ({ names }: { names: string[] }) =>
    savedHooks.filter((hook) => names.includes(hook.name))
  );
  const kmsDataKeyService = {
    wrapKey: vi.fn().mockResolvedValue(Buffer.from("wrapped")),
    // The "sealed" bytes are the plaintext behind a marker, so a test can read what was sealed.
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
      })
    })
  };
  const resourceMetadataDAL = { insertMany: vi.fn(), find: vi.fn().mockResolvedValue([]), delete: vi.fn() };
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction,
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
    agentVaultHookDAL: { findByNamesForService },
    resourceMetadataDAL,
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession },
    agentVaultSessionInlineSkillDAL: { insertForSession: vi.fn(async () => []) },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue([]) },
    agentVaultServiceDAL: { findByAccessBundleId: vi.fn().mockResolvedValue([]) },
    agentVaultVariableDAL: { findKeys, findOauthForResolve },
    membershipDAL: { findResourceMembershipsForActor: vi.fn().mockResolvedValue([]) },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(rules),
        hasRole: () => true,
        memberships: []
      })
    },
    kmsDataKeyService,
    licenseService: {
      getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: hooksOnPlan }))
    }
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, transaction, insertForSession, findByNamesForService, resourceMetadataDAL, findKeys };
};

const mintWithHook = (
  service: ReturnType<typeof buildService>["service"],
  hook: { name: string; methods?: AgentVaultHttpMethod[]; paths?: string[]; tools?: string[] }
) =>
  service.mintSession({
    projectId: PROJECT_ID,
    ctx,
    services: [
      {
        type: AgentVaultServiceType.Http,
        name: "api",
        hostPattern: "api.example.com",
        credential: { type: AgentVaultCredentialType.Passthrough },
        hook
      },
      {
        type: AgentVaultServiceType.Http,
        hostPattern: "other.example.com",
        credential: { type: AgentVaultCredentialType.Passthrough }
      }
    ],
    actorName: "Ana Silva",
    actorEmail: "ana@acme.com",
    label: null
  });

describe("mintSession, inline services with a saved hook", () => {
  test("finds the hook by name in the mint transaction and stores it with its narrowing", async () => {
    const { service, insertForSession, findByNamesForService } = buildService();

    await mintWithHook(service, { name: "approvals", methods: [AgentVaultHttpMethod.Post], paths: ["/charges"] });

    expect(findByNamesForService).toHaveBeenCalledWith(
      { names: ["approvals"], projectId: PROJECT_ID },
      expect.anything()
    );
    const [withHook, withoutHook] = insertForSession.mock.calls[0][0].services;
    expect(withHook).toMatchObject({
      hookId: HOOK_ID,
      hookMethods: ["POST"],
      hookPaths: ["/charges"],
      hookTools: null
    });
    expect(withHook).not.toHaveProperty("hook");
    expect(withoutHook).toMatchObject({ hookId: null, hookMethods: null, hookPaths: null, hookTools: null });
  });

  test("returns each inline service's hook by name for the mint audit, from the hooks the transaction read", async () => {
    const { service, findByNamesForService } = buildService();

    const { session } = await mintWithHook(service, {
      name: "approvals",
      methods: [AgentVaultHttpMethod.Post],
      paths: ["/charges"]
    });

    expect(findByNamesForService).toHaveBeenCalledTimes(1);
    const [withHook, withoutHook] = session.services;
    expect(withHook).toMatchObject({
      hook: { id: HOOK_ID, name: "approvals", methods: ["POST"], paths: ["/charges"] }
    });
    expect(withoutHook).toMatchObject({ hook: null });
  });

  test("leaves each inline service's hook out for a caller who can't read hooks", async () => {
    const { service } = buildService({
      rules: [
        { action: "manage", subject: "all" },
        { action: "read", subject: "agent-vault-hooks", inverted: true }
      ]
    });

    const { session } = await service.mintSession({
      projectId: PROJECT_ID,
      ctx,
      services: [
        {
          type: AgentVaultServiceType.Http,
          hostPattern: "other.example.com",
          credential: { type: AgentVaultCredentialType.Passthrough }
        }
      ],
      actorName: "Ana Silva",
      actorEmail: null,
      label: null
    });

    expect(session.services[0]).not.toHaveProperty("hook");
  });

  test("off-plan, naming a hook is refused with the plan message before any transaction", async () => {
    const { service, transaction } = buildService({ hooksOnPlan: false });

    await expect(mintWithHook(service, { name: "approvals" })).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    expect(transaction).not.toHaveBeenCalled();
  });

  test("off-plan, an inline service without a hook still mints", async () => {
    const { service, insertForSession } = buildService({ hooksOnPlan: false });

    await service.mintSession({
      projectId: PROJECT_ID,
      ctx,
      services: [
        {
          type: AgentVaultServiceType.Http,
          hostPattern: "other.example.com",
          credential: { type: AgentVaultCredentialType.Passthrough }
        }
      ],
      actorName: "Ana Silva",
      actorEmail: null,
      label: null
    });

    expect(insertForSession).toHaveBeenCalledTimes(1);
  });

  test("a name the project has no hook for is a 404 naming it, and nothing is written", async () => {
    const { service, insertForSession } = buildService({ savedHooks: [] });

    await expect(mintWithHook(service, { name: "approvals" })).rejects.toThrow(
      new NotFoundError({ message: "There's no hook called 'approvals' in this project." })
    );
    expect(insertForSession).not.toHaveBeenCalled();
  });

  test("needs read on hooks, checked before any transaction", async () => {
    const { service, transaction } = buildService({
      rules: [
        { action: "manage", subject: "all" },
        { action: "read", subject: "agent-vault-hooks", inverted: true }
      ]
    });

    await expect(mintWithHook(service, { name: "approvals" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction).not.toHaveBeenCalled();
  });

  test("a narrowing the service's type can't use is refused before any transaction", async () => {
    const { service, transaction } = buildService();

    await expect(mintWithHook(service, { name: "approvals", tools: ["delete_issue"] })).rejects.toThrow(
      "'api' is an HTTP service, and only an MCP service can be narrowed by tools. Leave them out to check every request to it."
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});

type TCatalogEntry = { id: string; name: string; hostPattern: string; type?: AgentVaultServiceType };

const GITHUB: TCatalogEntry = { id: "svc-github", name: "github", hostPattern: "api.github.com" };
const LINEAR: TCatalogEntry = { id: "svc-linear", name: "linear", hostPattern: "api.linear.app" };

// A user who either reaches every bundle (an Admin) or holds grants to `grantedBundleIds`, in a project whose services
// are `catalog`, each in the bundles `bundlesOf` lists. `bundleServices` is what each bundle holds as the replica
// sees it, and `bundleServicesOnPrimary` as a transaction does, when a write the replica hasn't caught up with matters.
// `deletedOnPrimary` names catalog services a transaction no longer finds, and `overrides` what resolve would send beside
// the listed services. A Member who `canSendInline` may also send inline services.
const buildMintWithServices = ({
  isAdmin,
  canSendInline = false,
  grantedBundleIds = [],
  catalog = [GITHUB, LINEAR],
  bundlesOf = {},
  bundles = [],
  bundleServices = {},
  bundleServicesOnPrimary = bundleServices,
  deletedOnPrimary = [],
  overrides = []
}: {
  isAdmin: boolean;
  canSendInline?: boolean;
  deletedOnPrimary?: string[];
  overrides?: { name: string }[];
  grantedBundleIds?: string[];
  catalog?: TCatalogEntry[];
  bundlesOf?: Record<string, string[]>;
  bundles?: { id: string; name: string }[];
  bundleServices?: Record<string, TCatalogEntry[]>;
  bundleServicesOnPrimary?: Record<string, TCatalogEntry[]>;
}) => {
  const insertListedServices = vi.fn();
  const insertForSession = vi.fn(async ({ services }: { services: TAgentVaultInlineServiceInsert[] }) =>
    services.map((row) => ({ ...row, id: `inline-${row.position}`, sessionId: "session-1" }))
  );
  const permission = isAdmin
    ? createMongoAbility([{ action: "manage", subject: "all" }])
    : createMongoAbility([
        {
          action: ["read", "create", "edit", "revoke", ...(canSendInline ? ["create-with-inline-services"] : [])],
          subject: "agent-vault-sessions"
        }
      ]);
  const findServiceOverrides = vi.fn().mockResolvedValue(overrides);
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ raw: vi.fn() })),
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession },
    agentVaultSessionServiceDAL: { insertMany: insertListedServices },
    agentVaultSessionInlineSkillDAL: { insertForSession: vi.fn(async () => []) },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue(bundles) },
    resourceMetadataDAL: { insertMany: vi.fn() },
    agentVaultServiceDAL: {
      find: vi.fn(async ({ $in }: { $in: { id: string[] } }) =>
        catalog
          .filter((entry) => $in.id.includes(entry.id) && !deletedOnPrimary.includes(entry.id))
          .map((entry) => ({ type: AgentVaultServiceType.Http, description: null, ...entry }))
      ),
      findByAccessBundleId: vi.fn(
        async (bundleId: string, tx?: unknown) => (tx ? bundleServicesOnPrimary : bundleServices)[bundleId] ?? []
      ),
      findCatalogByNames: vi.fn(async ({ names }: { names: string[] }) =>
        catalog
          .filter((entry) => names.includes(entry.name))
          .map((entry) => ({ type: AgentVaultServiceType.Http, description: null, ...entry }))
      ),
      findIdsInBundles: vi.fn(async (bundleIds: string[]) =>
        catalog
          .filter((entry) => (bundlesOf[entry.id] ?? []).some((bundleId) => bundleIds.includes(bundleId)))
          .map((entry) => entry.id)
      )
    },
    agentVaultResolveDAL: { findServiceOverrides },
    membershipDAL: {
      findResourceMembershipsForActor: vi
        .fn()
        .mockResolvedValue(
          grantedBundleIds.map((bundleId) => ({ scopeResourceId: bundleId, isActive: true, actorGroupId: null }))
        )
    },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ permission, hasRole: () => isAdmin, memberships: [] })
    },
    kmsDataKeyService: { wrapKey: vi.fn().mockResolvedValue(Buffer.from("wrapped")) }
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, insertListedServices, findServiceOverrides };
};

const mintWith = (
  service: ReturnType<typeof buildMintWithServices>["service"],
  services: TMintSessionDTO["services"]
) =>
  service.mintSession({ projectId: PROJECT_ID, ctx, services, actorName: "Ana Silva", actorEmail: null, label: null });

const inline = (hostPattern: string, name?: string) => ({
  type: AgentVaultServiceType.Http,
  ...(name && { name }),
  hostPattern,
  credential: { type: AgentVaultCredentialType.Passthrough as const }
});

describe("mintSession, services listed by name", () => {
  test("an Admin names any project service, and the list reads back in the order sent", async () => {
    const { service, insertListedServices } = buildMintWithServices({ isAdmin: true });

    const { session } = await mintWith(service, ["github", inline("scratch.example.com", "scratch"), "linear"]);

    const [listedRows] = insertListedServices.mock.calls[0] as [
      { sessionId: string; serviceId: string; position: number }[]
    ];
    expect(listedRows.map(({ serviceId, position }) => [serviceId, position])).toEqual([
      [GITHUB.id, 0],
      [LINEAR.id, 2]
    ]);
    expect(new Set(listedRows.map(({ sessionId }) => sessionId)).size).toBe(1);
    expect(session.services.map((entry) => [entry.name, entry.isInline])).toEqual([
      ["github", false],
      ["scratch", true],
      ["linear", false]
    ]);
  });

  test("a Member lists a service in an access bundle granted to them, and no other", async () => {
    const { service } = buildMintWithServices({
      isAdmin: false,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [GITHUB.id]: ["bundle-1"], [LINEAR.id]: ["bundle-2"] }
    });

    await expect(mintWith(service, ["github"])).resolves.toBeDefined();
    await expect(mintWith(service, ["linear"])).rejects.toThrow(
      "You can't use a service called 'linear'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
  });

  test("an unknown name is refused like one out of reach, so it doesn't confirm what exists", async () => {
    const { service } = buildMintWithServices({ isAdmin: true });

    await expect(mintWith(service, ["nope"])).rejects.toThrow("You can't use a service called 'nope'.");
  });

  test("a Member still can't send a service inline", async () => {
    const { service } = buildMintWithServices({ isAdmin: false, grantedBundleIds: ["bundle-1"] });

    await expect(mintWith(service, [inline("scratch.example.com")])).rejects.toThrow(
      "You are not allowed to create-with-inline-services on agent-vault-sessions."
    );
  });

  test("refuses two listed services that cover the same host", async () => {
    const mirror = { id: "svc-mirror", name: "github-mirror", hostPattern: "api.github.com" };
    const { service } = buildMintWithServices({ isAdmin: true, catalog: [GITHUB, mirror] });

    await expect(mintWith(service, ["github", "github-mirror"])).rejects.toThrow(
      "The services 'github-mirror' and 'github' both cover api.github.com:443, so one session can't carry both."
    );
  });

  test("refuses an inline service that covers a listed service's host", async () => {
    const { service } = buildMintWithServices({ isAdmin: true });

    await expect(mintWith(service, ["github", inline("api.github.com", "gh-direct")])).rejects.toThrow(
      "which 'github', a project service in this session, already covers"
    );
  });

  test("refuses a listed service that a service just added to the bundle covers, though the replica hasn't seen it", async () => {
    const proxy = { id: "svc-gh-proxy", name: "gh-proxy", hostPattern: "api.github.com" };
    const { service, insertListedServices } = buildMintWithServices({
      isAdmin: true,
      bundles: [{ id: "bundle-1", name: "engineering" }],
      bundleServices: { "bundle-1": [] },
      bundleServicesOnPrimary: { "bundle-1": [proxy] }
    });

    await expect(
      service.mintSession({
        projectId: PROJECT_ID,
        ctx,
        accessBundle: "engineering",
        services: ["github"],
        actorName: "Ana Silva",
        actorEmail: null,
        label: null
      })
    ).rejects.toThrow(
      "The services 'github' and 'gh-proxy' both cover api.github.com:443, so one session can't carry both."
    );
    expect(insertListedServices).not.toHaveBeenCalled();
  });

  test("refuses a service deleted since the catalog read with the same 400 as an unknown name", async () => {
    const { service, insertListedServices } = buildMintWithServices({ isAdmin: true, deletedOnPrimary: [GITHUB.id] });

    await expect(mintWith(service, ["github"])).rejects.toThrow(
      "You can't use a service called 'github'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
    expect(insertListedServices).not.toHaveBeenCalled();
  });

  test("refuses an inline service named like an override a listed service brings", async () => {
    const { service, insertListedServices, findServiceOverrides } = buildMintWithServices({
      isAdmin: false,
      canSendInline: true,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [GITHUB.id]: ["bundle-1"] },
      overrides: [{ name: "gh-readonly" }]
    });

    await expect(mintWith(service, ["github", inline("unrelated.example.com", "gh-readonly")])).rejects.toThrow(
      "The service 'gh-readonly' has the same name as 'gh-readonly', a service this session gets from an access bundle alongside one of its project services. Give it a different name."
    );
    expect(findServiceOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        accessBundleIds: ["bundle-1"],
        services: [expect.objectContaining({ id: GITHUB.id })]
      }),
      undefined
    );
    expect(insertListedServices).not.toHaveBeenCalled();
  });

  test("an Admin's listed services bring no overrides, so their inline services aren't checked against any", async () => {
    const { service, findServiceOverrides } = buildMintWithServices({ isAdmin: true });

    await expect(mintWith(service, ["github", inline("scratch.example.com", "gh-readonly")])).resolves.toBeDefined();
    expect(findServiceOverrides).not.toHaveBeenCalled();
  });
});

describe("mintSession, metadata", () => {
  test("writes one row per entry in the mint transaction, in the order sent, and returns the metadata", async () => {
    const { service, resourceMetadataDAL } = buildService();
    const metadata = { runId: "8812", slackChannel: "#deploys" };

    const result = await service.mintSession({
      projectId: PROJECT_ID,
      ctx,
      services: [
        {
          type: AgentVaultServiceType.Http,
          hostPattern: "api.example.com",
          credential: { type: AgentVaultCredentialType.Passthrough }
        }
      ],
      actorName: "Ana Silva",
      actorEmail: "ana@acme.com",
      label: null,
      metadata
    });

    const [rows, tx] = resourceMetadataDAL.insertMany.mock.calls[0] as [Record<string, unknown>[], unknown];
    expect(tx).toBeDefined();
    expect(rows.map(({ key, value, orgId }) => ({ key, value, orgId }))).toEqual([
      { key: "runId", value: "8812", orgId: "org-1" },
      { key: "slackChannel", value: "#deploys", orgId: "org-1" }
    ]);
    expect(rows.every((row) => row.agentVaultSessionId === result.session.id)).toBe(true);
    // One statement gives every row the same default createdAt, which reads would then order arbitrarily.
    expect((rows[0].createdAt as Date).getTime()).toBeLessThan((rows[1].createdAt as Date).getTime());
    expect(result.session.metadata).toEqual(metadata);
  });
});

describe("updateSession", () => {
  const SESSION_ID = "session-1";
  const visibleSession = {
    id: SESSION_ID,
    userId: "user-1",
    identityId: null,
    onBehalfOfUserId: null,
    onBehalfOfUserName: null,
    label: "old label",
    actor: { type: "user", id: "user-1", username: "ana", email: "ana@acme.com", firstName: null, lastName: null },
    onBehalfOf: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    accessBundle: null,
    stats: null
  };

  const buildUpdateService = ({
    storedMetadata = [] as { key: string; value: string }[],
    isEditable = true,
    rules = [{ action: "manage", subject: "all" }] as { action: string; subject: string; inverted?: boolean }[],
    inlineRows = [] as Record<string, unknown>[]
  } = {}) => {
    const tx = { marker: "tx" };
    const agentVaultSessionDAL = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      findForList: vi.fn().mockResolvedValue({ sessions: [visibleSession], totalCount: 1 }),
      updateLabel: vi.fn().mockResolvedValue({ previousLabel: "old label", isUpdated: isEditable }),
      lockForEdit: vi.fn().mockResolvedValue({ previousLabel: "old label", isEditable })
    };
    const resourceMetadataDAL = {
      find: vi
        .fn()
        .mockResolvedValue(
          storedMetadata.map((row, index) => ({ ...row, id: `m-${index}`, agentVaultSessionId: SESSION_ID }))
        ),
      delete: vi.fn(),
      insertMany: vi.fn()
    };
    const findNamesByIds = vi.fn().mockResolvedValue(new Map([[HOOK_ID, "approvals"]]));
    const service = agentVaultSessionServiceFactory({
      agentVaultSessionDAL,
      resourceMetadataDAL,
      agentVaultHookDAL: { findNamesByIds },
      agentVaultSessionInlineServiceDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue(inlineRows) },
      agentVaultSessionServiceDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue([]) },
      agentVaultVariableDAL: {
        findOauthForResolve: vi.fn().mockResolvedValue([{ id: VARIABLE_ID, key: "GDRIVE_U123" }])
      },
      agentVaultSessionInlineSkillDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue([]) },
      agentVaultSessionSkillDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue([]) },
      permissionService: {
        getProjectPermission: vi.fn().mockResolvedValue({
          permission: createMongoAbility(rules),
          hasRole: () => true,
          memberships: []
        })
      }
    } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
    return { service, agentVaultSessionDAL, resourceMetadataDAL, tx, findNamesByIds };
  };

  test("a session's service names its OAuth variable only to a caller who can read variables", async () => {
    const inlineRows = [
      {
        id: "inline-0",
        sessionId: SESSION_ID,
        projectId: PROJECT_ID,
        position: 0,
        name: "gdrive",
        description: null,
        hookUrl: null,
        type: AgentVaultServiceType.Http,
        hostPattern: "www.googleapis.com",
        config: null,
        allowedMethods: null,
        allowedPathPrefixes: null,
        allowedTools: null,
        credentialType: AgentVaultCredentialType.OAuth,
        credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID },
        customHeaders: [],
        substitutions: []
      }
    ];
    const reader = buildUpdateService({ inlineRows });
    const withoutRead = buildUpdateService({
      inlineRows,
      rules: [
        { action: "manage", subject: "all" },
        { action: "read", subject: "agent-vault-variables", inverted: true }
      ]
    });

    const read = await reader.service.getSessionById({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });
    const hidden = await withoutRead.service.getSessionById({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });

    expect(inlineCredentialOf(read.session.services[0])).toMatchObject({
      variable: { id: VARIABLE_ID, key: "GDRIVE_U123" }
    });
    expect(inlineCredentialOf(hidden.session.services[0])).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "variable"
    });
  });

  test("a session's inline service names its hook only to a caller who can read hooks, from one lookup", async () => {
    const inlineRowOf = (position: number, hookId: string | null) => ({
      id: `inline-${position}`,
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      position,
      name: `api-${position}`,
      description: null,
      hookUrl: null,
      hookId,
      hookMethods: hookId ? ["POST"] : null,
      hookPaths: hookId ? ["/v1/refunds"] : null,
      hookTools: null,
      type: AgentVaultServiceType.Http,
      hostPattern: `api-${position}.example.com`,
      config: null,
      allowedMethods: null,
      allowedPathPrefixes: null,
      allowedTools: null,
      credentialType: AgentVaultCredentialType.Passthrough,
      credentialConfig: { type: AgentVaultCredentialType.Passthrough },
      customHeaders: [],
      substitutions: []
    });
    const inlineRows = [inlineRowOf(0, HOOK_ID), inlineRowOf(1, HOOK_ID), inlineRowOf(2, null)];
    const reader = buildUpdateService({ inlineRows });
    const withoutRead = buildUpdateService({
      inlineRows,
      rules: [
        { action: "manage", subject: "all" },
        { action: "read", subject: "agent-vault-hooks", inverted: true }
      ]
    });

    const read = await reader.service.getSessionById({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });
    const hidden = await withoutRead.service.getSessionById({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });

    expect(reader.findNamesByIds).toHaveBeenCalledTimes(1);
    expect(reader.findNamesByIds).toHaveBeenCalledWith({ ids: [HOOK_ID, HOOK_ID], projectId: PROJECT_ID });
    expect(read.session.services.map((service) => (service.isInline ? service.hook : undefined))).toEqual([
      { id: HOOK_ID, name: "approvals", methods: ["POST"], paths: ["/v1/refunds"] },
      { id: HOOK_ID, name: "approvals", methods: ["POST"], paths: ["/v1/refunds"] },
      null
    ]);
    expect(withoutRead.findNamesByIds).not.toHaveBeenCalled();
    hidden.session.services.forEach((service) => expect(service).not.toHaveProperty("hook"));
  });

  const update = (service: ReturnType<typeof buildUpdateService>["service"], fields: object) =>
    service.updateSession({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID, ...fields });

  test("replaces the whole metadata set in the label's transaction and leaves the label alone", async () => {
    const { service, agentVaultSessionDAL, resourceMetadataDAL, tx } = buildUpdateService({
      storedMetadata: [{ key: "runId", value: "1" }]
    });

    const result = await update(service, { metadata: { ticket: "OPS-12" } });

    expect(agentVaultSessionDAL.updateLabel).not.toHaveBeenCalled();
    expect(agentVaultSessionDAL.lockForEdit).toHaveBeenCalledWith(SESSION_ID, PROJECT_ID, tx);
    expect(resourceMetadataDAL.find.mock.calls[0][1]).toMatchObject({ tx });
    expect(resourceMetadataDAL.delete).toHaveBeenCalledWith({ agentVaultSessionId: SESSION_ID }, tx);
    expect(resourceMetadataDAL.insertMany.mock.calls[0][1]).toBe(tx);
    expect(result.session).toMatchObject({ label: "old label", metadata: { ticket: "OPS-12" } });
    expect(result.isChanged).toBe(true);
  });

  test("an empty object clears the metadata", async () => {
    const { service, resourceMetadataDAL } = buildUpdateService({ storedMetadata: [{ key: "runId", value: "1" }] });

    const result = await update(service, { metadata: {} });

    expect(resourceMetadataDAL.delete).toHaveBeenCalled();
    expect(resourceMetadataDAL.insertMany).toHaveBeenCalledWith([], expect.anything());
    expect(result.session.metadata).toEqual({});
    expect(result.isChanged).toBe(true);
  });

  test("a label-only update keeps the metadata and writes no rows", async () => {
    const { service, agentVaultSessionDAL, resourceMetadataDAL } = buildUpdateService({
      storedMetadata: [{ key: "runId", value: "1" }]
    });

    const result = await update(service, { label: "new label" });

    expect(agentVaultSessionDAL.updateLabel).toHaveBeenCalled();
    expect(resourceMetadataDAL.delete).not.toHaveBeenCalled();
    expect(resourceMetadataDAL.insertMany).not.toHaveBeenCalled();
    expect(result.session).toMatchObject({ label: "new label", metadata: { runId: "1" } });
    expect(result.isChanged).toBe(true);
  });

  test("the same label and metadata again change nothing, so nothing is audited", async () => {
    const { service, resourceMetadataDAL } = buildUpdateService({ storedMetadata: [{ key: "runId", value: "1" }] });

    const result = await update(service, { label: "old label", metadata: { runId: "1" } });

    expect(resourceMetadataDAL.delete).not.toHaveBeenCalled();
    expect(result.isChanged).toBe(false);
  });

  test("is refused, writing nothing, once the session's owner is deleted", async () => {
    const { service, resourceMetadataDAL } = buildUpdateService({ isEditable: false });

    await expect(update(service, { metadata: { runId: "1" } })).rejects.toThrow("label and metadata can't be changed");
    expect(resourceMetadataDAL.delete).not.toHaveBeenCalled();
    expect(resourceMetadataDAL.insertMany).not.toHaveBeenCalled();
  });
});

describe("mintSession, an inline service using an OAuth variable", () => {
  const mintWithVariable = (service: ReturnType<typeof buildService>["service"]) =>
    service.mintSession({
      projectId: PROJECT_ID,
      ctx,
      services: [
        {
          type: AgentVaultServiceType.Http,
          name: "gdrive",
          hostPattern: "www.googleapis.com",
          credential: { type: AgentVaultCredentialType.OAuth, variable: "GDRIVE_U123" }
        }
      ],
      actorName: "Ana Silva",
      actorEmail: "ana@acme.com",
      label: null
    });

  test("needs read-value on variables, checked before the key is looked up", async () => {
    const { service, findKeys, transaction } = buildService({
      rules: [
        { action: "manage", subject: "all" },
        { action: "read-value", subject: "agent-vault-variables", inverted: true }
      ]
    });

    await expect(mintWithVariable(service)).rejects.toThrow(/read-value/);
    expect(findKeys).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  test("stores the variable's id with nothing sealed, and the session names the variable", async () => {
    const { service, insertForSession } = buildService();

    const result = await mintWithVariable(service);

    const [row] = insertForSession.mock.calls[0][0].services;
    expect(row).toMatchObject({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID },
      encryptedCredential: null
    });
    expect(inlineCredentialOf(result.session.services[0])).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      variable: { id: VARIABLE_ID, key: "GDRIVE_U123" }
    });
  });
});

type TSkillCatalogEntry = { id: string; name: string; description: string };

const CODE_REVIEW: TSkillCatalogEntry = { id: "skill-review", name: "code-review", description: "Reviews code." };
const RELEASE_NOTES: TSkillCatalogEntry = { id: "skill-notes", name: "release-notes", description: "Writes notes." };

const skillFolder = (name: string, body = "Body.") => ({
  files: [
    {
      path: "SKILL.md",
      mode: AgentVaultSkillFileMode.Regular,
      contentBase64: Buffer.from(`---\nname: ${name}\ndescription: Does ${name}.\n---\n${body}\n`).toString("base64")
    }
  ]
});

// Like buildMintWithServices, for a project whose skills are `catalog`, each in the bundles `bundlesOf` lists.
const buildSkillService = ({
  isAdmin,
  grantedBundleIds = [],
  catalog = [CODE_REVIEW, RELEASE_NOTES],
  bundlesOf = {},
  canSendSkills = true
}: {
  isAdmin: boolean;
  grantedBundleIds?: string[];
  catalog?: TSkillCatalogEntry[];
  bundlesOf?: Record<string, string[]>;
  canSendSkills?: boolean;
}) => {
  const insertListedSkills = vi.fn();
  const insertInlineSkills = vi.fn(async ({ skills }: { skills: TAgentVaultInlineSkillInsert[] }) =>
    skills.map(({ encryptedFiles, ...row }) => ({
      ...row,
      id: `inline-skill-${row.position}`,
      sessionId: "session-1",
      filesDeletedAt: null,
      createdAt: new Date()
    }))
  );
  const memberActions = ["read", "create", "edit", "revoke", ...(canSendSkills ? ["create-with-inline-skills"] : [])];
  const permission = isAdmin
    ? createMongoAbility([{ action: "manage", subject: "all" }])
    : createMongoAbility([{ action: memberActions, subject: "agent-vault-sessions" }]);
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ raw: vi.fn() })),
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession: vi.fn(async () => []) },
    agentVaultSessionServiceDAL: { insertMany: vi.fn() },
    agentVaultSessionSkillDAL: { insertMany: insertListedSkills },
    agentVaultSessionInlineSkillDAL: { insertForSession: insertInlineSkills },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue([]) },
    resourceMetadataDAL: { insertMany: vi.fn() },
    agentVaultServiceDAL: { findByAccessBundleId: vi.fn().mockResolvedValue([]) },
    agentVaultSkillDAL: {
      findByNamesInProject: vi.fn(async ({ names }: { names: string[] }) =>
        catalog.filter((entry) => names.includes(entry.name))
      )
    },
    agentVaultSkillBundleDAL: {
      findSkillIdsInBundles: vi.fn(async (bundleIds: string[]) =>
        catalog
          .filter((entry) => (bundlesOf[entry.id] ?? []).some((bundleId) => bundleIds.includes(bundleId)))
          .map((entry) => entry.id)
      )
    },
    membershipDAL: {
      findResourceMembershipsForActor: vi
        .fn()
        .mockResolvedValue(
          grantedBundleIds.map((bundleId) => ({ scopeResourceId: bundleId, isActive: true, actorGroupId: null }))
        )
    },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ permission, hasRole: () => isAdmin, memberships: [] })
    },
    kmsDataKeyService: {
      wrapKey: vi.fn().mockResolvedValue(Buffer.from("wrapped")),
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
        })
      })
    }
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, insertListedSkills, insertInlineSkills };
};

const mintSkills = (service: ReturnType<typeof buildSkillService>["service"], skills: TMintSessionDTO["skills"]) =>
  service.mintSession({ projectId: PROJECT_ID, ctx, skills, actorName: "Ana Silva", actorEmail: null, label: null });

describe("mintSession, skills", () => {
  test("an Admin names any project skill beside an inline one, and the list reads back in the order sent", async () => {
    const { service, insertListedSkills, insertInlineSkills } = buildSkillService({ isAdmin: true });

    const { session } = await mintSkills(service, ["code-review", skillFolder("scratch"), "release-notes"]);

    const [listedRows] = insertListedSkills.mock.calls[0] as [{ skillId: string; position: number }[]];
    expect(listedRows.map(({ skillId, position }) => [skillId, position])).toEqual([
      [CODE_REVIEW.id, 0],
      [RELEASE_NOTES.id, 2]
    ]);
    const [inlineRow] = insertInlineSkills.mock.calls[0][0].skills;
    expect(inlineRow).toMatchObject({
      projectId: PROJECT_ID,
      position: 1,
      name: "scratch",
      description: "Does scratch.",
      fileCount: 1
    });
    expect(session.skills.map((entry) => [entry.name, entry.isInline])).toEqual([
      ["code-review", false],
      ["scratch", true],
      ["release-notes", false]
    ]);
    expect(session.services).toEqual([]);
  });

  test("seals an inline skill's files whole, in the form its hash is taken over, and never returns them", async () => {
    const { service, insertInlineSkills } = buildSkillService({ isAdmin: true });

    const { session } = await mintSkills(service, [skillFolder("scratch", "Secret steps.")]);

    const [row] = insertInlineSkills.mock.calls[0][0].skills;
    const sealed = row.encryptedFiles.subarray("sealed:".length).toString();
    expect(JSON.parse(sealed)).toEqual(skillFolder("scratch", "Secret steps.").files);
    expect(row.sha256).toBe(sha256Hex(sealed));
    expect(session.skills[0]).toMatchObject({ isInline: true, sha256: row.sha256, sizeBytes: row.sizeBytes });
    expect(session.skills[0]).not.toHaveProperty("files");
  });

  test("a Member lists a skill in an access bundle granted to them, and no other", async () => {
    const { service } = buildSkillService({
      isAdmin: false,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [CODE_REVIEW.id]: ["bundle-1"], [RELEASE_NOTES.id]: ["bundle-2"] }
    });

    await expect(mintSkills(service, ["code-review"])).resolves.toBeDefined();
    await expect(mintSkills(service, ["release-notes"])).rejects.toThrow(
      "You can't use a skill called 'release-notes'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
  });

  test("an unknown name is refused like one out of reach, so it doesn't confirm what exists", async () => {
    const { service } = buildSkillService({ isAdmin: true });

    await expect(mintSkills(service, ["nope"])).rejects.toThrow("You can't use a skill called 'nope'.");
  });

  test("a Member sends a skill inline, and without the action no one can", async () => {
    const { service } = buildSkillService({ isAdmin: false });
    await expect(mintSkills(service, [skillFolder("scratch")])).resolves.toBeDefined();

    const { service: withoutAction, insertInlineSkills } = buildSkillService({ isAdmin: false, canSendSkills: false });
    await expect(mintSkills(withoutAction, [skillFolder("scratch")])).rejects.toThrow(
      "You are not allowed to create-with-inline-skills on agent-vault-sessions."
    );
    expect(insertInlineSkills).not.toHaveBeenCalled();
  });

  test("checks an inline skill's files like an upload, and names the skill in the error", async () => {
    const { service } = buildSkillService({ isAdmin: true });
    const tooBig = {
      files: [
        ...skillFolder("big").files,
        { path: "data.bin", mode: AgentVaultSkillFileMode.Regular, contentBase64: "A".repeat(400 * 1024) }
      ]
    };

    await expect(mintSkills(service, [tooBig])).rejects.toThrow("Skill 'big': File 'data.bin' is larger than 256 KB.");
    await expect(
      mintSkills(service, [
        { files: [{ path: "README.md", mode: AgentVaultSkillFileMode.Regular, contentBase64: "" }] }
      ])
    ).rejects.toThrow("Skill at index 0: SKILL.md is missing.");
  });

  test("an inline skill can't take the built-in skill's name", async () => {
    const { service } = buildSkillService({ isAdmin: true });

    await expect(mintSkills(service, [skillFolder("infisical-agent-vault")])).rejects.toThrow(
      "Skill 'infisical-agent-vault': 'infisical-agent-vault' is reserved for the skill Agent Vault gives every agent."
    );
  });
});
