import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultCredentialType, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "../agent-vault/agent-vault-hook-fns";
import { TAgentVaultInlineServiceInsert } from "./agent-vault-session-inline-service-dal";
import { agentVaultSessionServiceFactory } from "./agent-vault-session-service";
import { TMintSessionDTO } from "./agent-vault-session-types";

const PROJECT_ID = "project-1";
const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as TMintSessionDTO["ctx"];

const buildService = ({ hooksOnPlan }: { hooksOnPlan: boolean }) => {
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
  const licenseService = {
    getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: hooksOnPlan }))
  };
  const kmsService = {
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
    resourceMetadataDAL,
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue([]) },
    agentVaultServiceDAL: { findByAccessBundleId: vi.fn().mockResolvedValue([]) },
    membershipDAL: { findResourceMembershipsForActor: vi.fn().mockResolvedValue([]) },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility([{ action: "manage", subject: "all" }]),
        hasRole: () => true,
        memberships: []
      })
    },
    kmsService,
    licenseService
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, transaction, insertForSession, licenseService, resourceMetadataDAL };
};

const mint = (service: ReturnType<typeof buildService>["service"]) =>
  service.mintSession({
    projectId: PROJECT_ID,
    ctx,
    services: [
      {
        type: AgentVaultServiceType.Http,
        hostPattern: "api.example.com",
        credential: { type: AgentVaultCredentialType.Passthrough },
        hook: { url: HOOK_URL, signingSecret: SECRET }
      }
    ],
    actorName: "Ana Silva",
    actorEmail: "ana@acme.com",
    label: null
  });

describe("mintSession, inline services with a hook", () => {
  test("is refused before any transaction with hooks off the plan", async () => {
    const { service, transaction, licenseService } = buildService({ hooksOnPlan: false });

    await expect(mint(service)).rejects.toThrow(AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE);
    expect(licenseService.getPlan).toHaveBeenCalledWith("org-1");
    expect(transaction).not.toHaveBeenCalled();
  });

  test("stores the URL and the sealed secret, and returns only the URL", async () => {
    const { service, insertForSession } = buildService({ hooksOnPlan: true });

    const result = await mint(service);

    const [row] = insertForSession.mock.calls[0][0].services;
    expect(row.hookUrl).toBe(HOOK_URL);
    expect(row.encryptedHookSecret).toEqual(
      Buffer.concat([Buffer.from("sealed:"), Buffer.from(JSON.stringify({ value: SECRET }))])
    );
    expect(result.session.services[0]).toMatchObject({ isInline: true, hook: { url: HOOK_URL } });
    expect(JSON.stringify(result.session)).not.toContain(SECRET);
  });

  test("checks no plan when no service has a hook", async () => {
    const { service, licenseService } = buildService({ hooksOnPlan: false });

    await service.mintSession({
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
      label: null
    });
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });
});

type TCatalogEntry = { id: string; name: string; hostPattern: string; type?: AgentVaultServiceType };

const GITHUB: TCatalogEntry = { id: "svc-github", name: "github", hostPattern: "api.github.com" };
const LINEAR: TCatalogEntry = { id: "svc-linear", name: "linear", hostPattern: "api.linear.app" };

// A user who either reaches every bundle (an Admin) or holds grants to `grantedBundleIds`, in a project whose services
// are `catalog`, each in the bundles `bundlesOf` lists. `bundleServices` is what each bundle holds as the replica
// sees it, and `bundleServicesOnPrimary` as a transaction does, when a write the replica hasn't caught up with matters.
// `deletedOnPrimary` names catalog services a transaction no longer finds, and `overrides` what resolve would send beside
// the named services. A Member who `canSendInline` may also send inline services.
const buildNamingService = ({
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
  const insertNamed = vi.fn();
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
  const findNamedServiceOverrides = vi.fn().mockResolvedValue(overrides);
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ raw: vi.fn() })),
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession },
    agentVaultSessionServiceDAL: { insertMany: insertNamed },
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
    agentVaultResolveDAL: { findNamedServiceOverrides },
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
    kmsService: { wrapKey: vi.fn().mockResolvedValue(Buffer.from("wrapped")) },
    licenseService: { getPlan: vi.fn() }
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, insertNamed, findNamedServiceOverrides };
};

const mintWith = (service: ReturnType<typeof buildNamingService>["service"], services: TMintSessionDTO["services"]) =>
  service.mintSession({ projectId: PROJECT_ID, ctx, services, actorName: "Ana Silva", actorEmail: null, label: null });

const inline = (hostPattern: string, name?: string) => ({
  type: AgentVaultServiceType.Http,
  ...(name && { name }),
  hostPattern,
  credential: { type: AgentVaultCredentialType.Passthrough as const }
});

describe("mintSession, project services named in services", () => {
  test("an Admin names any project service, and the list reads back in the order sent", async () => {
    const { service, insertNamed } = buildNamingService({ isAdmin: true });

    const { session } = await mintWith(service, ["github", inline("scratch.example.com", "scratch"), "linear"]);

    const [namedRows] = insertNamed.mock.calls[0] as [{ sessionId: string; serviceId: string; position: number }[]];
    expect(namedRows.map(({ serviceId, position }) => [serviceId, position])).toEqual([
      [GITHUB.id, 0],
      [LINEAR.id, 2]
    ]);
    expect(new Set(namedRows.map(({ sessionId }) => sessionId)).size).toBe(1);
    expect(session.services.map((entry) => [entry.name, entry.isInline])).toEqual([
      ["github", false],
      ["scratch", true],
      ["linear", false]
    ]);
  });

  test("a Member names a service in an access bundle granted to them, and no other", async () => {
    const { service } = buildNamingService({
      isAdmin: false,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [GITHUB.id]: ["bundle-1"], [LINEAR.id]: ["bundle-2"] }
    });

    await expect(mintWith(service, ["github"])).resolves.toBeDefined();
    await expect(mintWith(service, ["linear"])).rejects.toThrow(
      "You can't name a service called 'linear'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
  });

  test("an unknown name is refused like one out of reach, so it doesn't confirm what exists", async () => {
    const { service } = buildNamingService({ isAdmin: true });

    await expect(mintWith(service, ["nope"])).rejects.toThrow("You can't name a service called 'nope'.");
  });

  test("a Member still can't send a service inline", async () => {
    const { service } = buildNamingService({ isAdmin: false, grantedBundleIds: ["bundle-1"] });

    await expect(mintWith(service, [inline("scratch.example.com")])).rejects.toThrow(
      "You are not allowed to create-with-inline-services on agent-vault-sessions."
    );
  });

  test("refuses two named services that cover the same host", async () => {
    const mirror = { id: "svc-mirror", name: "github-mirror", hostPattern: "api.github.com" };
    const { service } = buildNamingService({ isAdmin: true, catalog: [GITHUB, mirror] });

    await expect(mintWith(service, ["github", "github-mirror"])).rejects.toThrow(
      "The services 'github-mirror' and 'github' both cover api.github.com:443, so one session can't carry both."
    );
  });

  test("refuses an inline service that covers a named service's host", async () => {
    const { service } = buildNamingService({ isAdmin: true });

    await expect(mintWith(service, ["github", inline("api.github.com", "gh-direct")])).rejects.toThrow(
      "which 'github', a service this session names, already covers"
    );
  });

  test("refuses a named service that a service just added to the bundle covers, though the replica hasn't seen it", async () => {
    const proxy = { id: "svc-gh-proxy", name: "gh-proxy", hostPattern: "api.github.com" };
    const { service, insertNamed } = buildNamingService({
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
    expect(insertNamed).not.toHaveBeenCalled();
  });

  test("refuses a service deleted since the catalog read with the same 400 as an unknown name", async () => {
    const { service, insertNamed } = buildNamingService({ isAdmin: true, deletedOnPrimary: [GITHUB.id] });

    await expect(mintWith(service, ["github"])).rejects.toThrow(
      "You can't name a service called 'github'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
    expect(insertNamed).not.toHaveBeenCalled();
  });

  test("refuses an inline service named like an override a named service brings", async () => {
    const { service, insertNamed, findNamedServiceOverrides } = buildNamingService({
      isAdmin: false,
      canSendInline: true,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [GITHUB.id]: ["bundle-1"] },
      overrides: [{ name: "gh-readonly" }]
    });

    await expect(mintWith(service, ["github", inline("unrelated.example.com", "gh-readonly")])).rejects.toThrow(
      "The service 'gh-readonly' has the same name as 'gh-readonly', a service this session gets from an access bundle alongside a service it names. Give it a different name."
    );
    expect(findNamedServiceOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        accessBundleIds: ["bundle-1"],
        services: [expect.objectContaining({ id: GITHUB.id })]
      }),
      undefined
    );
    expect(insertNamed).not.toHaveBeenCalled();
  });

  test("an Admin's named services bring no overrides, so their inline services aren't checked against any", async () => {
    const { service, findNamedServiceOverrides } = buildNamingService({ isAdmin: true });

    await expect(mintWith(service, ["github", inline("scratch.example.com", "gh-readonly")])).resolves.toBeDefined();
    expect(findNamedServiceOverrides).not.toHaveBeenCalled();
  });
});

describe("mintSession, metadata", () => {
  test("writes one row per entry in the mint transaction, in the order sent, and returns the metadata", async () => {
    const { service, resourceMetadataDAL } = buildService({ hooksOnPlan: true });
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

  const buildUpdateService = ({ storedMetadata = [] as { key: string; value: string }[], isEditable = true } = {}) => {
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
    const service = agentVaultSessionServiceFactory({
      agentVaultSessionDAL,
      resourceMetadataDAL,
      agentVaultSessionInlineServiceDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue([]) },
      agentVaultSessionServiceDAL: { findSummariesBySessionIds: vi.fn().mockResolvedValue([]) },
      permissionService: {
        getProjectPermission: vi.fn().mockResolvedValue({
          permission: createMongoAbility([{ action: "manage", subject: "all" }]),
          hasRole: () => true,
          memberships: []
        })
      }
    } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
    return { service, agentVaultSessionDAL, resourceMetadataDAL, tx };
  };

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
