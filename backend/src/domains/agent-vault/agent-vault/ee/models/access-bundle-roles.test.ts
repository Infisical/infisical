import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import { AccessBundleRoles } from "./access-bundle-roles";

describe("AccessBundleRoles.rulesFor", () => {
  test("should give a consumer no rules", () => {
    // Setup
    const roles = new AccessBundleRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: "consumer" }));

    // Assert
    expect(rules).toEqual([]);
    expect(roles.resourceType).toBe(ResourceType.AgentVaultAccessBundle);
  });

  test.each(["admin", "custom"])("should refuse the slug %s, which Agent Vault does not define", (slug) => {
    // Setup
    const roles = new AccessBundleRoles();

    // Action
    const resolve = () => roles.rulesFor(Grant.restore({ slug, packedRules: [] }));

    // Assert
    expect(resolve).toThrow(EntityNotFoundError);
    expect(resolve).toThrow(`Agent Vault role '${slug}' not found`);
    expect(resolve).toThrow(expect.objectContaining({ name: "AgentVaultRoleInvalid" }) as Error);
  });
});

describe("AccessBundleRoles.projectAdminRules", () => {
  test("should give a project admin nothing on a bundle it is not granted", () => {
    // Setup
    const roles = new AccessBundleRoles();

    // Action
    const rules = roles.projectAdminRules();

    // Assert
    expect(rules).toEqual([]);
  });
});
