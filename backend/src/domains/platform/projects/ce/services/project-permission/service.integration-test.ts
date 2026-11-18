import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { PAST } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "../../models/project-permission-set";
import { TProjectRule } from "../../models/standard-project-roles";
import { buildProjectsModule } from "../../testing/projects-module";

const createMember = { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member } as const;
const readValueAt = (secretPath: string) =>
  ({
    action: ProjectPermissionSecretActions.ReadValue,
    subject: ProjectPermissionSub.Secrets,
    fields: { environment: "prod", secretPath }
  }) as const;

describe("ProjectPermissionService.getProjectPermission", () => {
  const h = setupIntegration();

  const arrange = async ({ type = ProjectType.SecretManager }: { type?: ProjectType } = {}) => {
    const tenant = await h.newTenant({ projectType: type });
    const seed = new KnexGrantSeeder(h.db);
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: tenant.org.id, userId: user.id, role: OrgMembershipRole.Member });
    const projects = buildProjectsModule(h.db);
    const organizations = new OrganizationsModule({ db: h.db, ...accessControlServices(h.db) });
    const principal: TPrincipal = {
      type: ActorType.USER,
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    };
    const actor = () => organizations.actorContextService.forPrincipal({ principal, orgId: tenant.org.id });
    return { tenant, seed, user, actor, service: projects.projectPermissionService };
  };

  test("should build a member's permission from the rows in Postgres", async () => {
    // Setup
    const { tenant, user, actor, service } = await arrange();
    await h.factories.projectMembership({
      orgId: tenant.org.id,
      projectId: tenant.project.id,
      userId: user.id,
      role: ProjectMembershipRole.Member
    });

    // Action
    const permission = await service.getProjectPermission({ actor: await actor(), projectId: tenant.project.id });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.isAdmin).toBe(false);
  });

  test("should apply a custom role held through a group, with the user's name filled in", async () => {
    // Setup
    const { tenant, seed, user, actor, service } = await arrange();
    const role = await seed.role({
      owner: { projectId: tenant.project.id },
      slug: `custom-${randomUUID()}`,
      permissions: packRules<TProjectRule>([
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: { $glob: "/users/{{identity.username}}/**" } }
        } as TProjectRule
      ])
    });
    const group = await seed.group({ orgId: tenant.org.id });
    await seed.groupMember({ groupId: group.id, userId: user.id });
    await seed.membership({
      scope: AccessScope.Project,
      orgId: tenant.org.id,
      projectId: tenant.project.id,
      actor: { groupId: group.id },
      roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
    });

    // Action
    const permission = await service.getProjectPermission({ actor: await actor(), projectId: tenant.project.id });

    // Assert
    expect(permission.can(readValueAt(`/users/${user.username}/db`))).toBe(true);
    expect(permission.can(readValueAt("/users/someone-else/db"))).toBe(false);
  });

  test("should leave out a temporary role that has ended and add a project-wide privilege", async () => {
    // Setup
    const { tenant, seed, user, actor, service } = await arrange();
    await seed.membership({
      scope: AccessScope.Project,
      orgId: tenant.org.id,
      projectId: tenant.project.id,
      actor: { userId: user.id },
      roles: [
        { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() },
        { role: ProjectMembershipRole.Viewer }
      ]
    });
    await seed.privilege({
      actor: { userId: user.id },
      projectId: tenant.project.id,
      permissions: packRules<TProjectRule>([
        { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }
      ])
    });

    // Action
    const permission = await service.getProjectPermission({ actor: await actor(), projectId: tenant.project.id });

    // Assert
    expect(permission.isAdmin).toBe(false);
    expect(permission.can({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags })).toBe(true);
    expect(permission.can(createMember)).toBe(false);
  });

  test("should refuse a user that is in the org but not in the project", async () => {
    // Setup
    const { tenant, actor, service } = await arrange();

    // Action
    const result = service.getProjectPermission({ actor: await actor(), projectId: tenant.project.id });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({ name: "ProjectMembershipNotFound" });
  });

  test("should refuse another org's project", async () => {
    // Setup
    const { user, actor, service } = await arrange();
    const other = await h.newTenant();
    await h.factories.projectMembership({ orgId: other.org.id, projectId: other.project.id, userId: user.id });

    // Action
    const result = service.getProjectPermission({ actor: await actor(), projectId: other.project.id });

    // Assert
    await expect(result).rejects.toThrow("This project does not belong to your selected organization.");
  });

  test("should refuse a check for another product's project type", async () => {
    // Setup
    const { tenant, user, actor, service } = await arrange({ type: ProjectType.KMS });
    await h.factories.projectMembership({ orgId: tenant.org.id, projectId: tenant.project.id, userId: user.id });

    // Action
    const result = service.getProjectPermission({
      actor: await actor(),
      projectId: tenant.project.id,
      type: ProjectType.SecretManager
    });

    // Assert
    await expect(result).rejects.toThrow(
      `The project is of type ${ProjectType.KMS}. Operations of type ${ProjectType.SecretManager} are not allowed.`
    );
  });
});
