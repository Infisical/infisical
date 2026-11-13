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
  const kmsDataKeyService = {
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
    kmsDataKeyService,
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
