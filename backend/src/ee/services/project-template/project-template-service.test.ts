import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

import { projectTemplateServiceFactory } from "./project-template-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
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

const createService = () =>
  projectTemplateServiceFactory({
    licenseService: {
      getPlan: vi.fn().mockResolvedValue({ projectTemplates: true, environmentLimit: null })
    },
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
      transaction: vi.fn().mockRejectedValue(REACHED_TRANSACTION)
    }
  } as unknown as Parameters<typeof projectTemplateServiceFactory>[0]);

const create = (name: string) =>
  createService().createProjectTemplate(
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
