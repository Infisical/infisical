import { randomUUID } from "node:crypto";

import { buildAccessControl } from "../../testing/build-access-control";

const BUILT_IN = ["admin", "member"];

describe("RoleService.resolveRoles", () => {
  test("should resolve built-in slugs as themselves and custom slugs to the owner's roles, in order", async () => {
    // Setup
    const { roleService, seed } = buildAccessControl();
    const orgId = randomUUID();
    const biller = await seed.role({ owner: { orgId }, slug: "biller" });
    await seed.role({ owner: { orgId: randomUUID() }, slug: "auditor" });

    // Action
    const resolved = await roleService.resolveRoles({
      owner: { orgId },
      slugs: ["biller", "admin"],
      builtInSlugs: BUILT_IN
    });

    // Assert
    expect(resolved.map(({ slug, role, grant }) => ({ slug, roleId: role?.id, custom: grant.isCustom() }))).toEqual([
      { slug: "biller", roleId: biller.id, custom: true },
      { slug: "admin", roleId: undefined, custom: false }
    ]);
  });

  test("should refuse a custom slug the owner has no role for, naming the owner", async () => {
    // Setup
    const { roleService, seed } = buildAccessControl();
    const projectId = randomUUID();
    await seed.role({ owner: { projectId: randomUUID() }, slug: "auditor" });

    // Action
    const result = roleService.resolveRoles({ owner: { projectId }, slugs: ["auditor"], builtInSlugs: BUILT_IN });

    // Assert
    await expect(result).rejects.toThrow(
      `Specified roles 'auditor' was not found in the project with ID '${projectId}'`
    );
  });

  test("should leave out a custom slug with no role when told to", async () => {
    // Setup
    const { roleService } = buildAccessControl();

    // Action
    const resolved = await roleService.resolveRoles({
      owner: { orgId: randomUUID() },
      slugs: ["missing", "member"],
      builtInSlugs: BUILT_IN,
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(resolved.map(({ slug }) => slug)).toEqual(["member"]);
  });

  test("should read no custom role when every slug is built in", async () => {
    // Setup
    const { roleService, grantStore } = buildAccessControl();
    const findRolesBySlugs = vi.spyOn(grantStore, "findRolesBySlugs");

    // Action
    await roleService.resolveRoles({ owner: { orgId: randomUUID() }, slugs: ["admin"], builtInSlugs: BUILT_IN });

    // Assert
    expect(findRolesBySlugs).not.toHaveBeenCalled();
  });
});
