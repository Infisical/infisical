import { randomUUID } from "node:crypto";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ActorType } from "@app/lib/auth/actor-types";

import { TResourceRoles } from "../../models/project-resource-permission";
import { buildProjects } from "../../testing/build-projects";

type TSet = ["read" | "edit", "thing"];

const read = { action: "read", subject: "thing" } as const;
const edit = { action: "edit", subject: "thing" } as const;

const roles: TResourceRoles<TSet> = {
  resourceType: "pam-folder",
  rulesFor: (grant) => {
    if (grant.isBuiltIn("viewer")) return [read];
    throw new EntityNotFoundError({ message: `Role '${grant.builtInSlug()}' not found` });
  },
  projectAdminRules: (): TPermissionRule<TSet>[] => [edit]
};

const arrange = () => {
  const projects = buildProjects();
  const org = actorOrg();
  const orgId = org.id;
  const projectId = projects.projectStore.add({ orgId, type: ProjectType.PAM }).id;
  const userId = randomUUID();
  const actor = (oauthScopes?: string[]) =>
    actorContext({
      principal: userPrincipal({ id: userId, oauth: oauthScopes ? { clientId: "c", scopes: oauthScopes } : undefined }),
      org
    });
  const addOrgRole = () =>
    projects.seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role: OrgMembershipRole.NoAccess }]
    });
  const addProjectRole = (role: string) =>
    projects.seed.membership({ scope: AccessScope.Project, orgId, projectId, actor: { userId }, roles: [{ role }] });
  const addResourceRole = (resourceId: string, role: string) =>
    projects.seed.membership({
      scope: RESOURCE_SCOPE,
      orgId,
      projectId,
      resourceType: "pam-folder",
      resourceId,
      actor: { userId },
      roles: [{ role }]
    });
  const get = (
    resourceIds: string[],
    { oauthScopes, type = ProjectType.PAM }: { oauthScopes?: string[]; type?: ProjectType } = {}
  ) =>
    projects.projectResourcePermissionService.getResourcePermission<TSet>({
      actor: actor(oauthScopes),
      projectId,
      type,
      resources: resourceIds.map((resourceId) => ({ resourceType: "pam-folder", resourceId })),
      roles
    });
  return { get, actor, addOrgRole, addProjectRole, addResourceRole, orgId, projectId, projects };
};

describe("ProjectResourcePermissionService.getResourcePermission", () => {
  test("should give a project member the rules of its role on the resource", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Member);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect([permission.can(read), permission.can(edit)]).toEqual([true, false]);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should add the project-admin rules on top of a project admin's own role", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect([permission.can(read), permission.can(edit)]).toEqual([true, true]);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should give a project admin with no role on the resource the project-admin rules alone", async () => {
    // Setup
    const { get, addProjectRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Admin);

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect([permission.can(read), permission.can(edit)]).toEqual([false, true]);
    expect(permission.isImplicitAdmin).toBe(true);
  });

  test("should refuse a project member with no role on the resource", async () => {
    // Setup
    const { get, addProjectRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Member);

    // Action
    const result = get(["f1"]);

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({
      message: "You are not a member of this pam-folder.",
      hasDefaultName: true
    });
  });

  test("should allow an org member who is not in the project but holds a role on the resource", async () => {
    // Setup
    const { get, addOrgRole, addResourceRole } = arrange();
    await addOrgRole();
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"]);

    // Assert
    expect(permission.can(read)).toBe(true);
  });

  test("should refuse an org member who is in neither the project nor the resource", async () => {
    // Setup
    const { get, addOrgRole } = arrange();
    await addOrgRole();

    // Action
    const result = get(["f1"]);

    // Assert
    await expect(result).rejects.toThrow("You are not a member of this pam-folder.");
  });

  test("should refuse someone outside the org with the org's refusal, even with a role on the resource", async () => {
    // Setup
    const { get, addResourceRole, orgId } = arrange();
    await addResourceRole("f1", "viewer");

    // Action
    const result = get(["f1"]);

    // Assert
    await expect(result).rejects.toThrow(`You are not a member of this organization with ID ${orgId}.`);
  });

  test("should combine the roles held on several resources", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Member);
    await addResourceRole("folder", "viewer");

    // Action
    const permission = await get(["folder", "account"]);

    // Assert
    expect(permission.can(read)).toBe(true);
  });

  test("should give a delegated OAuth token nothing on a resource, even a project admin's", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addResourceRole("f1", "viewer");

    // Action
    const permission = await get(["f1"], { oauthScopes: ["secrets:read"] });

    // Assert
    expect(permission.rules).toEqual([]);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should refuse a check for another product's project type", async () => {
    // Setup
    const { get, addProjectRole, addResourceRole } = arrange();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addResourceRole("f1", "viewer");

    // Action
    const result = get(["f1"], { type: ProjectType.CertificateManager });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
  });

  test("should refuse a machine principal that is neither a user nor an identity", async () => {
    // Setup
    const { projects, projectId } = arrange();

    // Action
    const result = projects.projectResourcePermissionService.getResourcePermission<TSet>({
      actor: actorContext({ principal: { type: ActorType.KMIP_SERVER, id: randomUUID() }, org: actorOrg() }),
      projectId,
      type: ProjectType.PAM,
      resources: [{ resourceType: "pam-folder", resourceId: "f1" }],
      roles
    });

    // Assert
    await expect(result).rejects.toThrow("Invalid actor provided");
  });
});
