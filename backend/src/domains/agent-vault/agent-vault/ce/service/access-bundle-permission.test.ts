import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { buildProjectsForTests } from "@app/domains/platform/projects/ce/testing/build-projects";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { getAccessBundlePermission } from "./access-bundle-permission";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const setup = () => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const { service: projectsDomain } = buildProjectsForTests({
    accessControlDomain,
    organizationsDomain: { getOrgPermission: async () => ({}) as never },
    projects: [{ id: projectId, orgId, type: ProjectType.AgentVault }]
  });
  const actor: TActorContext = {
    principal: {
      type: ActorType.USER,
      id: userId,
      username: "u",
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    },
    org: {
      id: orgId,
      name: "o",
      rootOrgId: orgId,
      parentOrgId: orgId,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    },
    plan: async () => {
      throw new Error("not needed");
    }
  };
  const { transactionRunner } = inMemory!;
  const write = <T>(work: Parameters<typeof transactionRunner.run<T>>[0]) => transactionRunner.run(work);
  const addProjectRole = (role: string, actorGroupId?: string) =>
    write(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        ...(actorGroupId ? { actorGroupId } : { actorUserId: userId }),
        roles: [{ role }]
      })
    );
  const grantBundle = (bundleId: string, actorGroupId?: string) =>
    write(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: RESOURCE_SCOPE,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.AgentVaultAccessBundle,
        scopeResourceId: bundleId,
        ...(actorGroupId ? { actorGroupId } : { actorUserId: userId }),
        roles: [{ role: "consumer" }]
      })
    );
  const addGroup = async () => {
    const group = await write(({ dataAccess }) =>
      dataAccess.groups.create({ orgId, name: "g", slug: `g-${randomUUID()}` })
    );
    await write(({ dataAccess }) => dataAccess.groups.addMembers(group.id, [{ userId }]));
    return group.id;
  };
  const get = () => getAccessBundlePermission({ projectsDomain, accessControlDomain }, { actor, projectId });
  return { get, addProjectRole, grantBundle, addGroup };
};

describe("getAccessBundlePermission", () => {
  test("should let a member reach only the bundles granted to it", async () => {
    // Setup
    const { get, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await grantBundle("b1");

    // Action
    const permission = await get();

    // Assert
    expect(permission.isAdmin).toBe(false);
    expect(permission.reachableAccessBundleIds).toEqual(["b1"]);
  });

  test("should let an admin reach every bundle while still listing the ones granted to it", async () => {
    // Setup
    const { get, addProjectRole, grantBundle } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await grantBundle("b1");

    // Action
    const permission = await get();

    // Assert
    expect(permission.reachableAccessBundleIds).toBeNull();
    expect(permission.grantedAccessBundleIds).toEqual(["b1"]);
  });

  test("should count a group's bundle grant only while the group holds a live role in the project", async () => {
    // Setup
    const { get, addProjectRole, grantBundle, addGroup } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    const liveGroup = await addGroup();
    const roleLessGroup = await addGroup();
    await addProjectRole(ProjectMembershipRole.Member, liveGroup);
    await grantBundle("through-live-group", liveGroup);
    await grantBundle("through-role-less-group", roleLessGroup);

    // Action
    const permission = await get();

    // Assert
    expect(permission.reachableAccessBundleIds).toEqual(["through-live-group"]);
  });
});
