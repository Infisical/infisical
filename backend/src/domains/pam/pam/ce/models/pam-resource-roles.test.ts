import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import { PamAccountRoles, PamFolderRoles } from "./pam-resource-roles";
import {
  pamResourceAdminPermissions,
  pamResourceAuditorPermissions,
  pamResourceConnectorPermissions,
  pamResourceOperatorPermissions
} from "./permissions/pam-roles";

describe("PamFolderRoles.rulesFor", () => {
  test.each([
    ["admin", pamResourceAdminPermissions],
    ["operator", pamResourceOperatorPermissions],
    ["connector", pamResourceConnectorPermissions],
    ["auditor", pamResourceAuditorPermissions]
  ])("should resolve the PAM role %s to its rules", (slug, expected) => {
    // Setup
    const roles = new PamFolderRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug }));

    // Assert
    expect(rules).toBe(expected);
    expect(roles.resourceType).toBe(ResourceType.PamFolder);
  });

  test.each(["custom", "member", "constructor"])("should refuse the slug %s, which PAM does not define", (slug) => {
    // Setup
    const roles = new PamFolderRoles();

    // Action
    const resolve = () => roles.rulesFor(Grant.restore({ slug, packedRules: [] }));

    // Assert
    expect(resolve).toThrow(EntityNotFoundError);
    expect(resolve).toThrow(`PAM role '${slug}' not found`);
    expect(resolve).toThrow(expect.objectContaining({ name: "PamRoleInvalid" }) as Error);
  });
});

describe("PamAccountRoles.rulesFor", () => {
  test("should resolve an account role to the same rules as a folder role", () => {
    // Setup
    const roles = new PamAccountRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: "connector" }));

    // Assert
    expect(rules).toBe(pamResourceConnectorPermissions);
    expect(roles.resourceType).toBe(ResourceType.PamAccount);
  });
});

describe("PamFolderRoles.projectAdminRules", () => {
  test("should give a project admin nothing on a folder or account it has no role on", () => {
    // Setup
    const all = [new PamFolderRoles(), new PamAccountRoles()];

    // Action
    const counts = all.map((roles) => roles.projectAdminRules().length);

    // Assert
    expect(counts).toEqual([0, 0]);
  });
});
