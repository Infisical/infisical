import { randomUUID } from "node:crypto";

import { ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import {
  ApplicationCertificatePermissionActions,
  ApplicationPermissionActions,
  ApplicationPermissionSub
} from "../../models/permissions/application-roles";
import { CertManagerModule } from "../../module";

describe("ApplicationPermissionService.getApplicationPermission", () => {
  const h = setupIntegration();

  const setup = async ({ projectRole }: { projectRole?: ProjectMembershipRole } = {}) => {
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({
      orgId: org.id,
      type: ProjectType.CertificateManager,
      environments: []
    });
    if (projectRole) {
      await h.factories.projectMembership({ orgId: org.id, projectId: project.id, userId: user.id, role: projectRole });
    }
    const applicationId = randomUUID();
    const seed = new KnexGrantSeeder(h.db);
    const assignApplicationRole = (role: string) =>
      seed.membership({
        scope: RESOURCE_SCOPE,
        orgId: org.id,
        projectId: project.id,
        resourceType: ResourceType.CertificateApplication,
        resourceId: applicationId,
        actor: { userId: user.id },
        roles: [{ role }]
      });
    const { organizationsService } = new OrganizationsModule({ db: h.db, ...accessControlServices(h.db) });
    const { applicationPermissionService } = new CertManagerModule({
      db: h.db,
      organizationsService,
      projectResourcePermissionService: buildProjectsModule(h.db).projectResourcePermissionService
    });
    const actor: TActorContext = {
      principal: {
        type: ActorType.USER,
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        authMethod: AuthMethod.EMAIL,
        isSuperAdmin: false
      },
      org: {
        id: org.id,
        name: org.name,
        rootOrgId: org.id,
        parentOrgId: org.id,
        shouldUseNewPrivilegeSystem: true,
        ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
      }
    };
    const get = () =>
      applicationPermissionService.getApplicationPermission({ actor, projectId: project.id, applicationId });
    return { get, assignApplicationRole };
  };

  const manageProfiles = {
    action: ApplicationPermissionActions.ManageProfiles,
    subject: ApplicationPermissionSub.Application
  } as const;
  const createCertificate = {
    action: ApplicationCertificatePermissionActions.Create,
    subject: ApplicationPermissionSub.Certificates
  } as const;

  test("should let an application operator issue certificates", async () => {
    // Setup
    const { get, assignApplicationRole } = await setup();
    await assignApplicationRole("operator");

    // Action
    const permission = await get();

    // Assert
    expect(permission.can(createCertificate)).toBe(true);
    expect(permission.can(manageProfiles)).toBe(false);
  });

  test("should give a project admin with no application role the fallback rules only", async () => {
    // Setup
    const { get } = await setup({ projectRole: ProjectMembershipRole.Admin });

    // Action
    const permission = await get();

    // Assert
    expect(permission.isImplicitAdmin).toBe(true);
    expect(permission.can(manageProfiles)).toBe(true);
    expect(permission.can(createCertificate)).toBe(false);
  });

  test("should refuse a project member with no application role", async () => {
    // Setup
    const { get } = await setup({ projectRole: ProjectMembershipRole.Member });

    // Action
    const result = get();

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    await expect(result).rejects.toThrow(`You are not a member of this ${ResourceType.CertificateApplication}.`);
  });
});
