import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ActorType } from "@app/services/auth/auth-type";

import { sha256Hex } from "../agent-vault-skill/agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "../agent-vault-skill/agent-vault-skill-types";
import { AgentVaultCredentialType, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import { AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE } from "../agent-vault/agent-vault-hook-fns";
import { TAgentVaultInlineServiceInsert } from "./agent-vault-session-inline-service-dal";
import { TAgentVaultInlineSkillInsert } from "./agent-vault-session-inline-skill-dal";
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
    agentVaultSessionInlineSkillDAL: { insertForSession: vi.fn(async () => []) },
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
    agentVaultSessionInlineSkillDAL: { insertForSession: vi.fn(async () => []) },
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

// Like buildNamingService, for a project whose skills are `catalog`, each in the bundles `bundlesOf` lists.
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
  const insertNamedSkills = vi.fn();
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
    agentVaultSessionSkillDAL: { insertMany: insertNamedSkills },
    agentVaultSessionInlineSkillDAL: { insertForSession: insertInlineSkills },
    agentVaultAccessBundleDAL: { find: vi.fn().mockResolvedValue([]) },
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
    kmsService: {
      wrapKey: vi.fn().mockResolvedValue(Buffer.from("wrapped")),
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
        })
      })
    },
    licenseService: { getPlan: vi.fn() }
  } as unknown as Parameters<typeof agentVaultSessionServiceFactory>[0]);
  return { service, insertNamedSkills, insertInlineSkills };
};

const mintSkills = (service: ReturnType<typeof buildSkillService>["service"], skills: TMintSessionDTO["skills"]) =>
  service.mintSession({ projectId: PROJECT_ID, ctx, skills, actorName: "Ana Silva", actorEmail: null, label: null });

describe("mintSession, skills", () => {
  test("an Admin names any project skill beside an inline one, and the list reads back in the order sent", async () => {
    const { service, insertNamedSkills, insertInlineSkills } = buildSkillService({ isAdmin: true });

    const { session } = await mintSkills(service, ["code-review", skillFolder("scratch"), "release-notes"]);

    const [namedRows] = insertNamedSkills.mock.calls[0] as [{ skillId: string; position: number }[]];
    expect(namedRows.map(({ skillId, position }) => [skillId, position])).toEqual([
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
    expect(JSON.stringify(session)).not.toContain(Buffer.from("Secret steps.").toString("base64"));
  });

  test("a Member names a skill in an access bundle granted to them, and no other", async () => {
    const { service } = buildSkillService({
      isAdmin: false,
      grantedBundleIds: ["bundle-1"],
      bundlesOf: { [CODE_REVIEW.id]: ["bundle-1"], [RELEASE_NOTES.id]: ["bundle-2"] }
    });

    await expect(mintSkills(service, ["code-review"])).resolves.toBeDefined();
    await expect(mintSkills(service, ["release-notes"])).rejects.toThrow(
      "You can't name a skill called 'release-notes'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it."
    );
  });

  test("an unknown name is refused like one out of reach, so it doesn't confirm what exists", async () => {
    const { service } = buildSkillService({ isAdmin: true });

    await expect(mintSkills(service, ["nope"])).rejects.toThrow("You can't name a skill called 'nope'.");
  });

  test("a Member sends a skill inline, and without the action no one can", async () => {
    const { service } = buildSkillService({ isAdmin: false });
    await expect(mintSkills(service, [skillFolder("scratch")])).resolves.toBeDefined();

    const { service: withoutAction, insertInlineSkills } = buildSkillService({ isAdmin: false, canSendSkills: false });
    await expect(mintSkills(withoutAction, [skillFolder("scratch")])).rejects.toThrow(
      "You don't have permission to send skills with a session."
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
