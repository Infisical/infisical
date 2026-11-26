import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { RuleIdentity } from "@app/domains/platform/access-control/ce/module";
import { FakeActorGrantsService } from "@app/domains/platform/access-control/ce/testing/fake-actor-grants-service";
import { PAST } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { InMemoryGrantSeeder } from "@app/domains/platform/access-control/ce/testing/in-memory-grant-seeder";
import { InMemoryGrantStore } from "@app/domains/platform/access-control/ce/testing/in-memory-grant-store";
import {
  Project,
  ProjectAccess,
  ProjectPermission,
  TGetProjectPermissionInput,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { AgentVaultProjectRoles } from "../../models/agent-vault-project-roles";
import { AccessBundlePermissionService } from "./service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";

const userActor = (userId: string): TActorContext => ({
  principal: {
    type: ActorType.USER,
    id: userId,
    username: "user",
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false
  },
  org: {
    id: ORG_ID,
    name: "org",
    rootOrgId: ORG_ID,
    parentOrgId: ORG_ID,
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
  }
});

const projectPermissionsOver = (actorGrantsService: FakeActorGrantsService) => {
  const getProjectPermission = vi.fn(async ({ actor, projectId }: TGetProjectPermissionInput) => {
    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      return ProjectPermission.forServiceToken({
        project: Project.restore({ id: projectId, name: "p", slug: "p", orgId: ORG_ID, type: ProjectType.AgentVault }),
        scopes: [],
        permissions: [],
        usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
      });
    }
    const grants = await actorGrantsService.getCachedProjectGrants({
      actor: { type: principal.type, id: principal.id },
      orgId: ORG_ID,
      projectId
    });
    if (!grants.hasMembership) {
      throw new PermissionDeniedError({ name: "ProjectMembershipNotFound", message: "not a member" });
    }
    return ProjectAccess.create({
      project: Project.restore({ id: projectId, name: "p", slug: "p", orgId: ORG_ID, type: ProjectType.AgentVault }),
      grants,
      roles: new AgentVaultProjectRoles(),
      principal,
      identity: RuleIdentity.create({ id: principal.id, username: "user", metadata: {} }),
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
    }).toPermission();
  });
  return { getProjectPermission } as unknown as TProjectPermissionService & {
    getProjectPermission: typeof getProjectPermission;
  };
};

const setup = () => {
  const grantStore = new InMemoryGrantStore();
  const seed = new InMemoryGrantSeeder(grantStore);
  const actorGrantsService = new FakeActorGrantsService(grantStore);
  const projectPermissionService = projectPermissionsOver(actorGrantsService);
  const service = new AccessBundlePermissionService(projectPermissionService, actorGrantsService);
  const userId = randomUUID();
  const actor = userActor(userId);
  const addProjectRole = (role: string, groupId?: string, temporaryAccessEndTime?: Date) =>
    seed.membership({
      scope: AccessScope.Project,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      actor: groupId ? { groupId } : { userId },
      roles: [{ role, temporaryAccessEndTime }]
    });
  const grantBundle = (bundleId: string, { groupId, isActive }: { groupId?: string; isActive?: boolean } = {}) =>
    seed.membership({
      scope: RESOURCE_SCOPE,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      resourceType: ResourceType.AgentVaultAccessBundle,
      resourceId: bundleId,
      actor: groupId ? { groupId } : { userId },
      isActive,
      roles: [{ role: "consumer" }]
    });
  const addGroup = async () => {
    const group = await seed.group({ orgId: ORG_ID });
    await seed.groupMember({ groupId: group.id, userId });
    return group.id;
  };
  return { service, seed, actor, userId, projectPermissionService, addProjectRole, grantBundle, addGroup };
};

describe("AccessBundlePermissionService.getAccessBundlePermission", () => {
  test("should let a member reach only the bundles granted to it", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await grantBundle("b1");

    // Action
    const reach = await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.reachesEveryBundle).toBe(false);
    expect(reach.accessBundleIds).toEqual(["b1"]);
  });

  test("should check the project as an Agent Vault project", async () => {
    // Setup
    const { service, actor, addProjectRole, projectPermissionService } = setup();
    await addProjectRole(ProjectMembershipRole.Member);

    // Action
    await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(projectPermissionService.getProjectPermission).toHaveBeenCalledWith({
      actor,
      projectId: PROJECT_ID,
      type: ProjectType.AgentVault
    });
  });

  test("should let an admin reach every bundle", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await grantBundle("b1");

    // Action
    const reach = await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.reachesEveryBundle).toBe(true);
    expect(reach.accessBundleIds).toBeNull();
  });

  test("should let a custom role slugged admin reach every bundle, as the role slug decides", async () => {
    // Setup
    const { service, seed, actor, userId } = setup();
    const role = await seed.role({ owner: { projectId: PROJECT_ID }, slug: ProjectMembershipRole.Admin });
    await seed.membership({
      scope: AccessScope.Project,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      actor: { userId },
      roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
    });

    // Action
    const reach = await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.reachesEveryBundle).toBe(true);
  });

  test("should count a group's bundle grant only while the group holds a live role in the project", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle, addGroup } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    const liveGroup = await addGroup();
    const lapsedGroup = await addGroup();
    const roleLessGroup = await addGroup();
    await addProjectRole(ProjectMembershipRole.Member, liveGroup);
    await addProjectRole(ProjectMembershipRole.Member, lapsedGroup, PAST());
    await grantBundle("through-live-group", { groupId: liveGroup });
    await grantBundle("through-lapsed-group", { groupId: lapsedGroup });
    await grantBundle("through-role-less-group", { groupId: roleLessGroup });

    // Action
    const reach = await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.accessBundleIds).toEqual(["through-live-group"]);
  });

  test("should leave out a deactivated bundle grant", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await grantBundle("active");
    await grantBundle("deactivated", { isActive: false });

    // Action
    const reach = await service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.accessBundleIds).toEqual(["active"]);
  });

  test("should let an actor that is not a user or identity reach no bundle", async () => {
    // Setup
    const { service, actor } = setup();
    const serviceActor: TActorContext = { ...actor, principal: { type: ActorType.SERVICE, id: "st", projectId: "p" } };

    // Action
    const reach = await service.getAccessBundlePermission({ actor: serviceActor, projectId: PROJECT_ID });

    // Assert
    expect(reach).toEqual(expect.objectContaining({ reachesEveryBundle: false, accessBundleIds: [] }));
  });

  test("should refuse a non-member", async () => {
    // Setup
    const { service, actor } = setup();

    // Action
    const result = service.getAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
  });
});

describe("AccessBundlePermissionService.getGrantedAccessBundlePermission", () => {
  test("should list an admin's granted bundles while it reaches every bundle", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await grantBundle("b1");

    // Action
    const reach = await service.getGrantedAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(reach.accessBundleIds).toBeNull();
    expect(reach.grantedAccessBundleIds).toEqual(["b1"]);
  });

  test("should reach exactly the granted bundles for a member", async () => {
    // Setup
    const { service, actor, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await grantBundle("b1");
    await grantBundle("b2");

    // Action
    const reach = await service.getGrantedAccessBundlePermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect([...(reach.accessBundleIds ?? [])].sort()).toEqual(["b1", "b2"]);
    expect([...reach.grantedAccessBundleIds].sort()).toEqual(["b1", "b2"]);
  });
});

describe("AccessBundlePermissionService.getAgentVaultPermission", () => {
  test("should return the project permission from the Agent Vault roles", async () => {
    // Setup
    const { service, actor, addProjectRole } = setup();
    await addProjectRole(ProjectMembershipRole.Member);

    // Action
    const { permission } = await service.getAgentVaultPermission({ actor, projectId: PROJECT_ID });

    // Assert
    expect(permission.hasBuiltInRole({ slug: ProjectMembershipRole.Admin })).toBe(false);
    expect(permission.hasRole({ slug: ProjectMembershipRole.Member })).toBe(true);
  });
});

describe("AccessBundlePermissionService.intersectAccessBundleIds", () => {
  // null means every bundle (what the admin reaches).
  test.each([
    { a: null, b: null, expected: null },
    { a: null, b: [], expected: [] },
    { a: [], b: null, expected: [] },
    { a: null, b: ["x"], expected: ["x"] },
    { a: ["x"], b: null, expected: ["x"] },
    { a: ["x", "y"], b: ["y", "z"], expected: ["y"] },
    { a: ["x"], b: ["z"], expected: [] }
  ])("should reach $expected from $a and $b", ({ a, b, expected }) => {
    // Setup
    const { service } = setup();

    // Action
    const result = service.intersectAccessBundleIds(a, b);

    // Assert
    expect(result).toEqual(expected);
  });
});
