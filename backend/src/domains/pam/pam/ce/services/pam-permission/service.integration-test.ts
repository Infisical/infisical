import { randomUUID } from "node:crypto";

import { ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { PamProjectRoles } from "../../models/pam-project-roles";
import { PamResourcePermissionActions, PamResourcePermissionSub } from "../../models/permissions/pam-roles";
import { PamModule } from "../../module";

const check = (action: PamResourcePermissionActions) => ({ action, subject: PamResourcePermissionSub.PamResource });

describe("PamPermissionService.getPamPermission", () => {
  const h = setupIntegration();

  const setup = async ({
    projectRole,
    projectType = ProjectType.PAM
  }: {
    projectRole?: ProjectMembershipRole;
    projectType?: ProjectType;
  } = {}) => {
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({ orgId: org.id, type: projectType, environments: [] });
    if (projectRole) {
      await h.factories.projectMembership({ orgId: org.id, projectId: project.id, userId: user.id, role: projectRole });
    }
    const folderId = randomUUID();
    const accountId = randomUUID();
    const seed = new KnexGrantSeeder(h.db);
    const assign = (resourceType: ResourceType, resourceId: string, role: string) =>
      seed.membership({
        scope: RESOURCE_SCOPE,
        orgId: org.id,
        projectId: project.id,
        resourceType,
        resourceId,
        actor: { userId: user.id },
        roles: [{ role }]
      });
    const projects = buildProjectsModule(h.db, { projectRoles: [new PamProjectRoles()] });
    const { pamPermissionService } = new PamModule({
      projectsService: projects.projectsService,
      projectResourcePermissionService: projects.projectResourcePermissionService,
      actorGrantsService: accessControlServices(h.db).actorGrantsService
    });
    const actor: TActorContext = {
      audit: new FakeActorAuditConfig(),
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
    return {
      actor,
      projectId: project.id,
      projects,
      assignFolderRole: (role: string) => assign(ResourceType.PamFolder, folderId, role),
      assignAccountRole: (role: string) => assign(ResourceType.PamAccount, accountId, role),
      getFolder: () => pamPermissionService.getPamPermission({ actor, projectId: project.id, folderId }),
      getAccount: () => pamPermissionService.getPamPermission({ actor, projectId: project.id, folderId, accountId })
    };
  };

  test("should let a folder operator launch sessions on an account in the folder", async () => {
    // Setup
    const { assignFolderRole, getAccount } = await setup({ projectRole: ProjectMembershipRole.Member });
    await assignFolderRole("operator");

    // Action
    const permission = await getAccount();

    // Assert
    expect(permission.can(check(PamResourcePermissionActions.LaunchSessions))).toBe(true);
    expect(permission.can(check(PamResourcePermissionActions.ManageMembers))).toBe(false);
  });

  test("should count a folder role and an account role together", async () => {
    // Setup
    const { assignFolderRole, assignAccountRole, getAccount } = await setup();
    await assignFolderRole("auditor");
    await assignAccountRole("connector");

    // Action
    const permission = await getAccount();

    // Assert
    expect(permission.can(check(PamResourcePermissionActions.ViewSessions))).toBe(true);
    expect(permission.can(check(PamResourcePermissionActions.LaunchSessions))).toBe(true);
    expect(permission.can(check(PamResourcePermissionActions.ViewCredentials))).toBe(false);
  });

  test("should give the product admin nothing on a folder it holds no role on", async () => {
    // Setup
    const { getFolder } = await setup({ projectRole: ProjectMembershipRole.Admin });

    // Action
    const permission = await getFolder();

    // Assert
    expect(permission.isImplicitAdmin).toBe(true);
    expect(permission.isProjectAdmin).toBe(true);
    expect(permission.can(check(PamResourcePermissionActions.ReadFolder))).toBe(false);
  });

  test("should refuse a member with no folder or account role, naming the account", async () => {
    // Setup
    const { getAccount } = await setup({ projectRole: ProjectMembershipRole.Member });

    // Action
    const result = getAccount();

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    await expect(result).rejects.toThrow(`You are not a member of this ${ResourceType.PamAccount}.`);
  });

  test("should refuse a folder in a project of another type", async () => {
    // Setup
    const { assignFolderRole, getFolder } = await setup({
      projectRole: ProjectMembershipRole.Member,
      projectType: ProjectType.SecretManager
    });
    await assignFolderRole("admin");

    // Action
    const result = getFolder();

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
  });
});

describe("PamProjectRoles.rulesFor", () => {
  const h = setupIntegration();

  test("should give a product member directory reads and nothing more", async () => {
    // Setup
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({ orgId: org.id, type: ProjectType.PAM, environments: [] });
    await h.factories.projectMembership({
      orgId: org.id,
      projectId: project.id,
      userId: user.id,
      role: ProjectMembershipRole.Member
    });
    const { projectPermissionService } = buildProjectsModule(h.db, { projectRoles: [new PamProjectRoles()] });
    const actor: TActorContext = {
      audit: new FakeActorAuditConfig(),
      principal: {
        type: ActorType.USER,
        id: user.id,
        username: user.username,
        email: null,
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

    // Action
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId: project.id,
      type: ProjectType.PAM
    });

    // Assert
    expect(permission.can({ action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member })).toBe(
      true
    );
    expect(
      permission.can({ action: ProjectPermissionIdentityActions.EditAuth, subject: ProjectPermissionSub.Identity })
    ).toBe(false);
  });
});
