import { randomUUID } from "node:crypto";

import { buildAccessControl } from "../../testing/build-access-control";

describe("RoleService.findRolesBySlugs", () => {
  test("should return the owner's custom roles with these slugs", async () => {
    // Setup
    const { roleService, seed } = buildAccessControl();
    const orgId = randomUUID();
    const biller = await seed.role({ owner: { orgId }, slug: "biller" });
    await seed.role({ owner: { orgId }, slug: "auditor" });
    await seed.role({ owner: { orgId: randomUUID() }, slug: "biller" });

    // Action
    const roles = await roleService.findRolesBySlugs({ owner: { orgId }, slugs: ["biller", "missing"] });

    // Assert
    expect(roles.map((role) => role.id)).toEqual([biller.id]);
  });
});
