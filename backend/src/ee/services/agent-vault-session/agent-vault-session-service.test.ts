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
    expect(result.session.services[0].hook).toEqual({ url: HOOK_URL });
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
