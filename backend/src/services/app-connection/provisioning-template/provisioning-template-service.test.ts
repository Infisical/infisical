import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { provisioningTemplateServiceFactory } from "./provisioning-template-service";

const getTemplate = vi.hoisted(() => vi.fn());

vi.mock("./aws/aws-provisioning-template-fns", () => ({
  awsProvisioningTemplateProvider: { getTemplate }
}));

const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;
const query = { partition: "aws", region: "us-east-1", useCases: [], stackName: "s", roleName: "r" } as never;

const buildService = (opts: { can: boolean; projectType?: ProjectType | null }) => {
  const permission = createMongoAbility(
    opts.can
      ? [
          { action: "create", subject: "app-connections" },
          { action: "create-app-connections", subject: "app-connections" }
        ]
      : [],
    { detectSubjectType: (subject: unknown) => subject as never }
  );
  const permissionService = {
    getOrgPermission: vi.fn().mockResolvedValue({ permission }),
    getProjectPermission: vi.fn().mockResolvedValue({ permission })
  };
  const projectDAL = {
    findProjectById: vi.fn().mockResolvedValue(opts.projectType === null ? undefined : { type: opts.projectType })
  };
  const service = provisioningTemplateServiceFactory({ permissionService, projectDAL } as never);
  return { service, permissionService, projectDAL };
};

describe("provisioningTemplateService.getProvisioningTemplate", () => {
  beforeEach(() => {
    getTemplate.mockReset().mockResolvedValue({ ok: true });
  });

  it("uses the org ID as External ID at org scope", async () => {
    const { service } = buildService({ can: true });
    await service.getProvisioningTemplate(AppConnection.AWS, { query }, actor);
    expect(getTemplate).toHaveBeenCalledWith({ externalId: "org-1" }, query);
  });

  it("uses the project ID as External ID for non Certificate Manager projects", async () => {
    const { service } = buildService({ can: true, projectType: ProjectType.SecretManager });
    await service.getProvisioningTemplate(AppConnection.AWS, { projectId: "proj-1", query }, actor);
    expect(getTemplate).toHaveBeenCalledWith({ externalId: "proj-1" }, query);
  });

  it("uses the org ID as External ID for Certificate Manager projects", async () => {
    const { service } = buildService({ can: true, projectType: ProjectType.CertificateManager });
    await service.getProvisioningTemplate(AppConnection.AWS, { projectId: "proj-1", query }, actor);
    expect(getTemplate).toHaveBeenCalledWith({ externalId: "org-1" }, query);
  });

  it("rejects an unknown project", async () => {
    const { service } = buildService({ can: true, projectType: null });
    await expect(
      service.getProvisioningTemplate(AppConnection.AWS, { projectId: "missing", query }, actor)
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(getTemplate).not.toHaveBeenCalled();
  });

  it("rejects actors without create permission at org and project scope", async () => {
    const denied = buildService({ can: false, projectType: ProjectType.SecretManager });
    await expect(
      denied.service.getProvisioningTemplate(AppConnection.AWS, { query }, actor)
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      denied.service.getProvisioningTemplate(AppConnection.AWS, { projectId: "proj-1", query }, actor)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(getTemplate).not.toHaveBeenCalled();
  });
});
