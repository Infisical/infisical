import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { provisioningTemplateServiceFactory } from "./provisioning-template-service";

const getTemplate = vi.hoisted(() => vi.fn());
const getUpdateTemplate = vi.hoisted(() => vi.fn());
const decryptAppConnectionConfiguration = vi.hoisted(() => vi.fn());

vi.mock("./aws/aws-provisioning-template-fns", () => ({
  awsProvisioningTemplateProvider: { getTemplate, getUpdateTemplate }
}));

vi.mock("../app-connection-fns", () => ({ decryptAppConnectionConfiguration }));

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
    await expect(denied.service.getProvisioningTemplate(AppConnection.AWS, { query }, actor)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(
      denied.service.getProvisioningTemplate(AppConnection.AWS, { projectId: "proj-1", query }, actor)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(getTemplate).not.toHaveBeenCalled();
  });
});

describe("provisioningTemplateService.getConnectionProvisioningTemplate", () => {
  const updateQuery = { useCases: ["secrets-manager"] };
  const configuration = { provisioning: { launchMethod: "launch-stack" } };

  const buildUpdateService = (opts: { actions: string[]; connection?: Record<string, unknown> | null }) => {
    const permission = createMongoAbility(opts.actions.map((action) => ({ action, subject: "app-connections" })));
    const permissionService = {
      getOrgPermission: vi.fn().mockResolvedValue({ permission }),
      getProjectPermission: vi.fn().mockResolvedValue({ permission })
    };
    const connection =
      opts.connection === null
        ? undefined
        : {
            id: "conn-1",
            app: AppConnection.AWS,
            method: "assume-role",
            orgId: "org-1",
            projectId: null,
            ...opts.connection
          };
    const appConnectionDAL = { findById: vi.fn().mockResolvedValue(connection) };
    const service = provisioningTemplateServiceFactory({
      permissionService,
      projectDAL: { findProjectById: vi.fn() },
      appConnectionDAL,
      kmsService: {}
    } as never);
    return { service, permissionService };
  };

  beforeEach(() => {
    getUpdateTemplate.mockReset().mockResolvedValue({ ok: true });
    decryptAppConnectionConfiguration.mockReset().mockResolvedValue(configuration);
  });

  it("passes the recorded configuration to the provider for a user who can edit an org connection", async () => {
    const { service } = buildUpdateService({ actions: ["edit"] });

    await service.getConnectionProvisioningTemplate(
      AppConnection.AWS,
      { connectionId: "conn-1", query: updateQuery },
      actor
    );

    expect(getUpdateTemplate).toHaveBeenCalledWith({ configuration, method: "assume-role" }, updateQuery);
  });

  it("checks Edit on the project for a project connection", async () => {
    const { service, permissionService } = buildUpdateService({
      actions: ["edit-app-connections"],
      connection: { projectId: "proj-1" }
    });

    await service.getConnectionProvisioningTemplate(
      AppConnection.AWS,
      { connectionId: "conn-1", query: updateQuery },
      actor
    );

    expect(permissionService.getProjectPermission).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1" })
    );
    expect(getUpdateTemplate).toHaveBeenCalled();
  });

  it("refuses a user who can create but not edit", async () => {
    const { service } = buildUpdateService({ actions: ["create", "connect", "read"] });

    await expect(
      service.getConnectionProvisioningTemplate(
        AppConnection.AWS,
        { connectionId: "conn-1", query: updateQuery },
        actor
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(decryptAppConnectionConfiguration).not.toHaveBeenCalled();
    expect(getUpdateTemplate).not.toHaveBeenCalled();
  });

  it("does not reveal a connection from another organization", async () => {
    const { service } = buildUpdateService({ actions: ["edit"], connection: { orgId: "org-2" } });

    await expect(
      service.getConnectionProvisioningTemplate(
        AppConnection.AWS,
        { connectionId: "conn-1", query: updateQuery },
        actor
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getUpdateTemplate).not.toHaveBeenCalled();
  });

  it("reports a missing connection", async () => {
    const { service } = buildUpdateService({ actions: ["edit"], connection: null });

    await expect(
      service.getConnectionProvisioningTemplate(
        AppConnection.AWS,
        { connectionId: "conn-1", query: updateQuery },
        actor
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a connection for another app", async () => {
    const { service } = buildUpdateService({ actions: ["edit"], connection: { app: AppConnection.GitHub } });

    await expect(
      service.getConnectionProvisioningTemplate(
        AppConnection.AWS,
        { connectionId: "conn-1", query: updateQuery },
        actor
      )
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(getUpdateTemplate).not.toHaveBeenCalled();
  });
});
