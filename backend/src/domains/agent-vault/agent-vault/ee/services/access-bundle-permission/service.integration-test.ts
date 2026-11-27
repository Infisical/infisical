import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { AgentVaultProjectRoles } from "../../models/agent-vault-project-roles";
import { AccessBundlePermissionService } from "./service";

describe("AccessBundlePermissionService.getAccessBundlePermission", () => {
  const h = setupIntegration();

  const setup = async () => {
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({ orgId: org.id, type: ProjectType.AgentVault, environments: [] });
    const seed = new KnexGrantSeeder(h.db);
    const addProjectRole = (role: string, actor: { userId: string } | { groupId: string } = { userId: user.id }) =>
      seed.membership({ scope: AccessScope.Project, orgId: org.id, projectId: project.id, actor, roles: [{ role }] });
    const grantBundle = (bundleId: string, actor: { userId: string } | { groupId: string } = { userId: user.id }) =>
      seed.membership({
        scope: RESOURCE_SCOPE,
        orgId: org.id,
        projectId: project.id,
        resourceType: ResourceType.AgentVaultAccessBundle,
        resourceId: bundleId,
        actor,
        roles: [{ role: "consumer" }]
      });
    const addGroup = async () => {
      const group = await seed.group({ orgId: org.id });
      await seed.groupMember({ groupId: group.id, userId: user.id });
      return group.id;
    };
    const { actorGrantsService } = accessControlServices(h.db);
    const { projectPermissionService } = buildProjectsModule(h.db, { projectRoles: [new AgentVaultProjectRoles()] });
    const service = new AccessBundlePermissionService(projectPermissionService, actorGrantsService);
    const actor: TActorContext = {
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
    const get = () => service.getAccessBundlePermission({ actor, projectId: project.id });
    return { get, addProjectRole, grantBundle, addGroup };
  };

  test("should let a member reach its own and its live groups' bundles only", async () => {
    // Setup
    const { get, addProjectRole, grantBundle, addGroup } = await setup();
    await addProjectRole(ProjectMembershipRole.Member);
    const liveGroup = await addGroup();
    const roleLessGroup = await addGroup();
    await addProjectRole(ProjectMembershipRole.Member, { groupId: liveGroup });
    const own = randomUUID();
    const throughGroup = randomUUID();
    await grantBundle(own);
    await grantBundle(throughGroup, { groupId: liveGroup });
    await grantBundle(randomUUID(), { groupId: roleLessGroup });

    // Action
    const reach = await get();

    // Assert
    expect([...(reach.accessBundleIds ?? [])].sort()).toEqual([own, throughGroup].sort());
    expect(
      reach.permission.can({
        action: ProjectPermissionAgentVaultSessionActions.ReadAny,
        subject: ProjectPermissionSub.AgentVaultSessions
      })
    ).toBe(false);
  });

  test("should let an admin reach every bundle and read any session", async () => {
    // Setup
    const { get, addProjectRole } = await setup();
    await addProjectRole(ProjectMembershipRole.Admin);

    // Action
    const reach = await get();

    // Assert
    expect(reach.accessBundleIds).toBeNull();
    expect(
      reach.permission.can({
        action: ProjectPermissionAgentVaultSessionActions.ReadAny,
        subject: ProjectPermissionSub.AgentVaultSessions
      })
    ).toBe(true);
  });
});
