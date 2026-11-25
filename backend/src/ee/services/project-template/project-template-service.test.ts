import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { projectTemplateServiceFactory } from "./project-template-service";

const mockConfig = vi.hoisted(() => ({ INFISICAL_CLOUD: false }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => mockConfig
}));

const ORG_ID = "org-1";
const TEMPLATE_ID = "template-1";
const LEGACY_NAME = "legacy​bot";

// Every allowed request ends at the transaction, so reaching it proves validation passed.
const REACHED_TRANSACTION = new Error("reached transaction");

const actor = {
  type: ActorType.USER,
  id: "actor-1",
  orgId: ORG_ID,
  authMethod: null
} as unknown as Parameters<ReturnType<typeof projectTemplateServiceFactory>["createProjectTemplate"]>[1];

// Without orgTemplateCount the transaction refuses before its callback runs, so the cap is never consulted.
const createService = ({ orgTemplateCount }: { orgTemplateCount?: number } = {}) =>
  projectTemplateServiceFactory({
    licenseService: new FakeLicenseService().setPlan(ORG_ID, {
      projectTemplates: true,
      environmentLimit: null,
      smProjectTemplatesPerOrgLimit: 100
    }),
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility([{ action: ["create", "edit"], subject: "project-templates" }])
      })
    },
    projectTemplateDAL: {
      findOne: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue({
        id: TEMPLATE_ID,
        orgId: ORG_ID,
        name: "template",
        type: ProjectType.SecretManager,
        roles: [],
        environments: [],
        projectManagedIdentities: [{ name: LEGACY_NAME, roles: [] }]
      }),
      find: vi.fn().mockResolvedValue([{ count: String(orgTemplateCount) }]),
      create: vi.fn().mockRejectedValue(REACHED_TRANSACTION),
      transaction:
        orgTemplateCount === undefined
          ? vi.fn().mockRejectedValue(REACHED_TRANSACTION)
          : vi.fn((cb: (tx: unknown) => unknown) => cb({}))
    }
  } as unknown as Parameters<typeof projectTemplateServiceFactory>[0]);

const create = (name: string, service = createService()) =>
  service.createProjectTemplate(
    {
      name: "template",
      type: ProjectType.SecretManager,
      roles: [],
      environments: [],
      projectManagedIdentities: [{ name, roles: [] }]
    } as unknown as Parameters<ReturnType<typeof projectTemplateServiceFactory>["createProjectTemplate"]>[0],
    actor
  );

const update = (names: string[]) =>
  createService().updateProjectTemplateById(
    TEMPLATE_ID,
    { projectManagedIdentities: names.map((name) => ({ name, roles: [] })) },
    actor
  );

describe("project-managed identity names", () => {
  test("create rejects a name with an invisible character", async () => {
    await expect(create("bad​bot")).rejects.toThrow(/zero-width/);
  });

  test("create rejects a name longer than the identity column", async () => {
    await expect(create("a".repeat(256))).rejects.toThrow(/too long/);
  });

  test("create accepts a normal name", async () => {
    await expect(create("deploy-bot")).rejects.toBe(REACHED_TRANSACTION);
  });

  test("update keeps a legacy name already on the template", async () => {
    await expect(update([LEGACY_NAME, "deploy-bot"])).rejects.toBe(REACHED_TRANSACTION);
  });

  test("update rejects a new name with an invisible character", async () => {
    await expect(update([LEGACY_NAME, "new‮bot"])).rejects.toThrow(/bidirectional/);
  });
});

describe("project template cap on Infisical Cloud", () => {
  test("create refuses a template past the per-organization cap", async () => {
    mockConfig.INFISICAL_CLOUD = true;
    try {
      const result = create("deploy-bot", createService({ orgTemplateCount: 100 }));
      await expect(result).rejects.toBeInstanceOf(BadRequestError);
      await expect(result).rejects.toThrow("Organization already has the maximum of 100 project templates");
    } finally {
      mockConfig.INFISICAL_CLOUD = false;
    }
  });

  test("create counts nothing on self-hosted", async () => {
    const service = createService({ orgTemplateCount: 100 });
    await expect(create("deploy-bot", service)).rejects.toBe(REACHED_TRANSACTION);
  });
});
