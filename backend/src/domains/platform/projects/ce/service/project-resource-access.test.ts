import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import { ActorGrants, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import type { OrgPermission } from "@app/domains/platform/organizations/ce/module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { Project } from "../model/project";
import { ProductAccessRegistry } from "./product-access-registry";
import { ProjectPermissionService } from "./project-permission-service";
import { ProjectResourceAccess, TResourceRoles } from "./project-resource-access";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type TSet = ["read" | "edit", "thing"];
const read: TPermissionRule<TSet>[] = [{ action: "read", subject: "thing" }];
const edit: TPermissionRule<TSet>[] = [{ action: "edit", subject: "thing" }];

const roles: TResourceRoles<TSet> = {
  resolveRole: (role) => {
    if (role === "viewer") return read;
    throw new NotFoundError({ message: `Role '${role}' not found` });
  },
  projectAdminFallback: edit
};

const setup = () => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const orgMembers = new Set<string>();
  const project = Project.restore({ id: projectId, name: "p", slug: "p", orgId, type: ProjectType.PAM });
  const projectPermissions = new ProjectPermissionService({
    accessControlDomain,
    registry: new ProductAccessRegistry(),
    projects: { findById: async (id) => (id === projectId ? project : undefined), findDeletionState: async () => "" },
    memo: new ActorMemo<{ project: Project; grants: ActorGrants }>()
  });
  const access = new ProjectResourceAccess({
    accessControlDomain,
    projectPermissions,
    // Mirrors getOrgPermission's refusal of a non-member; the org's rules do not matter here.
    organizationsDomain: {
      getOrgPermission: async ({ actor }) => {
        if (!orgMembers.has(actor.principal.id))
          throw new ForbiddenRequestError({ message: "You are not a member of this organization" });
        return {} as OrgPermission;
      }
    }
  });
  const actor = (oauthScopes?: string[]): TActorContext => ({
    principal: {
      type: ActorType.USER,
      id: userId,
      username: "u",
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false,
      oauth: oauthScopes ? { clientId: "c", scopes: oauthScopes } : undefined
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
  });
  const addProjectRole = (role: string) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: userId,
        roles: [{ role }]
      })
    );
  const addResourceRole = (resourceId: string, role: string) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: RESOURCE_SCOPE,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        scopeResourceType: "pam-folder",
        scopeResourceId: resourceId,
        actorUserId: userId,
        roles: [{ role }]
      })
    );
  const get = (resourceIds: string[], oauthScopes?: string[]) =>
    access.getProjectResourcePermission<TSet>({
      actor: actor(oauthScopes),
      projectId,
      type: ProjectType.PAM,
      resources: resourceIds.map((resourceId) => ({ resourceType: "pam-folder", resourceId })),
      roles
    });
  return { get, addProjectRole, addResourceRole, orgMembers, userId };
};

describe("ProjectResourceAccess.getProjectResourcePermission", () => {
  test("should give a project member the rules of its role on the resource", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect(permission.can({ action: "read", subject: "thing" })).toBe(true);
    expect(permission.can({ action: "edit", subject: "thing" })).toBe(false);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should add the project-admin fallback on top of a project admin's own role", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect(permission.can({ action: "edit", subject: "thing" })).toBe(true);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should give a project admin with no role on the resource the fallback only", async () => {
    // Setup
    const { get, addProjectRole } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect(permission.can({ action: "edit", subject: "thing" })).toBe(true);
    expect(permission.can({ action: "read", subject: "thing" })).toBe(false);
    expect(permission.isImplicitAdmin).toBe(true);
  });

  test("should refuse a project member with no role on the resource", async () => {
    // Setup
    const { get, addProjectRole } = setup();
    await addProjectRole(ProjectMembershipRole.Member);

    // Action
    const result = get(["f1"]);

    // Assert
    await expect(result).rejects.toThrow("You are not a member of this pam-folder.");
  });

  test("should allow an org member who is not in the project but holds a role on the resource", async () => {
    // Setup
    const { get, addResourceRole, orgMembers, userId } = setup();
    orgMembers.add(userId);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect(permission.can({ action: "read", subject: "thing" })).toBe(true);
  });

  test("should refuse someone in neither the project nor the org", async () => {
    // Setup
    const { get, addResourceRole } = setup();
    await addResourceRole("f1", "viewer");

    // Action
    const result = get(["f1"]);

    // Assert
    await expect(result).rejects.toThrow("You are not a member of this organization");
  });

  test("should combine the roles held on several resources", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = setup();
    await addProjectRole(ProjectMembershipRole.Member);
    await addResourceRole("folder", "viewer");

    // Action
    const permission = await get(["folder", "account"]);

    // Assert
    expect(permission.can({ action: "read", subject: "thing" })).toBe(true);
  });

  test("should give a delegated OAuth token nothing on a resource", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"], ["secrets:read"]);

    // Assert
    expect(permission.can({ action: "read", subject: "thing" })).toBe(false);
  });
});
