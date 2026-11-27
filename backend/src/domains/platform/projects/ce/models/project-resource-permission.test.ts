import { randomUUID } from "node:crypto";

import { RESOURCE_SCOPE } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { ActorGrants, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { TSeedRole } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { ActorType } from "@app/lib/auth/actor-types";

import { ProjectResourcePermission, TResourceRoles } from "./project-resource-permission";

type TSet = ["read" | "edit" | "delete", "thing"];

const read = { action: "read", subject: "thing" } as const;
const edit = { action: "edit", subject: "thing" } as const;
const remove = { action: "delete", subject: "thing" } as const;

const roles: TResourceRoles<TSet> = {
  resourceType: "widget",
  rulesFor: (grant) => {
    if (grant.isBuiltIn("viewer")) return [read];
    if (grant.isBuiltIn("locked")) return [{ ...remove, inverted: true }];
    throw new EntityNotFoundError({ message: `Widget role '${grant.builtInSlug()}' not found` });
  },
  projectAdminRules: (): TPermissionRule<TSet>[] => [edit, remove]
};

const resourceGrants = async (seeded: TSeedRole[]): Promise<ActorGrants> => {
  const { grantStore, seed } = buildAccessControl();
  const scope = {
    scope: RESOURCE_SCOPE,
    orgId: randomUUID(),
    projectId: randomUUID(),
    resourceType: "widget",
    resourceId: randomUUID()
  } as const;
  const userId = randomUUID();
  await seed.membership({ ...scope, actor: { userId }, roles: seeded });
  return grantStore.findActorGrants({ type: ActorType.USER, id: userId }, scope);
};

describe("ProjectResourcePermission.fromGrants", () => {
  test("should give a non-admin the roles it holds on the resource and nothing more", async () => {
    // Setup
    const grants = await resourceGrants([{ role: "viewer" }]);

    // Action
    const permission = ProjectResourcePermission.fromGrants({ grants, roles, isProjectAdmin: false });

    // Assert
    expect([permission.can(read), permission.can(edit)]).toEqual([true, false]);
    expect([permission.isImplicitAdmin, permission.isProjectAdmin]).toEqual([false, false]);
    expect(permission.hasRole({ slug: "viewer" })).toBe(true);
  });

  test("should add the project-admin rules after a project admin's own roles, so they decide where they match", async () => {
    // Setup
    const grants = await resourceGrants([{ role: "viewer" }, { role: "locked" }]);

    // Action
    const permission = ProjectResourcePermission.fromGrants({ grants, roles, isProjectAdmin: true });

    // Assert
    expect([permission.can(read), permission.can(edit), permission.can(remove)]).toEqual([true, true, true]);
    expect([permission.isImplicitAdmin, permission.isProjectAdmin]).toEqual([false, true]);
  });

  test("should refuse a role the product does not define", async () => {
    // Setup
    const grants = await resourceGrants([{ role: "ghost" }]);

    // Action
    const result = () => ProjectResourcePermission.fromGrants({ grants, roles, isProjectAdmin: false });

    // Assert
    expect(result).toThrow("Widget role 'ghost' not found");
  });
});

describe("ProjectResourcePermission.implicitAdmin", () => {
  test("should give the project-admin rules alone", () => {
    // Action
    const permission = ProjectResourcePermission.implicitAdmin({ roles });

    // Assert
    expect([permission.can(read), permission.can(edit)]).toEqual([false, true]);
    expect([permission.isImplicitAdmin, permission.isProjectAdmin]).toEqual([true, true]);
    expect(permission.memberships).toEqual([]);
  });
});

describe("ProjectResourcePermission.none", () => {
  test("should allow nothing", () => {
    // Action
    const permission = ProjectResourcePermission.none<TSet>();

    // Assert
    expect(permission.rules).toEqual([]);
    expect(permission.isImplicitAdmin).toBe(false);
  });
});
