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
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction,
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
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
  return { service, transaction, insertForSession, licenseService };
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
const buildNamingService = ({
  isAdmin,
  grantedBundleIds = [],
  catalog = [GITHUB, LINEAR],
  bundlesOf = {},
  bundles = [],
  bundleServices = {},
  bundleServicesOnPrimary = bundleServices
}: {
  isAdmin: boolean;
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
    : createMongoAbility([{ action: ["read", "create", "edit", "revoke"], subject: "agent-vault-sessions" }]);
  const service = agentVaultSessionServiceFactory({
    agentVaultSessionDAL: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ raw: vi.fn() })),
      createWithId: vi.fn(async (row: Record<string, unknown>) => ({ ...row, createdAt: new Date() }))
    },
    agentVaultSessionAccessBundleDAL: { insertMany: vi.fn() },
    agentVaultSessionInlineServiceDAL: { insertForSession },
    agentVaultSessionServiceDAL: { insertMany: insertNamed },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue(bundles) },
    agentVaultServiceDAL: {
      find: vi.fn(async ({ $in }: { $in: { id: string[] } }) =>
        catalog
          .filter((entry) => $in.id.includes(entry.id))
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
  return { service, insertNamed };
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
      "Only an Agent Vault admin can send inline services with a session."
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
});
