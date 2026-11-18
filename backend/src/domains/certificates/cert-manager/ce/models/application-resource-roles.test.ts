import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import { ApplicationRoles } from "./application-resource-roles";
import {
  applicationAdminPermissions,
  applicationAuditorPermissions,
  applicationOperatorPermissions,
  projectAdminApplicationFallbackPermissions
} from "./application-roles";

describe("ApplicationRoles.rulesFor", () => {
  test.each([
    ["admin", applicationAdminPermissions],
    ["operator", applicationOperatorPermissions],
    ["auditor", applicationAuditorPermissions]
  ])("should resolve the application role %s to its rules", (slug, expected) => {
    // Setup
    const roles = new ApplicationRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug }));

    // Assert
    expect(rules).toBe(expected);
    expect(roles.resourceType).toBe(ResourceType.CertificateApplication);
  });

  test("should refuse a custom application role", () => {
    // Setup
    const roles = new ApplicationRoles();

    // Action
    const resolve = () => roles.rulesFor(Grant.restore({ slug: "custom", packedRules: [] }));

    // Assert
    expect(resolve).toThrow(RuleViolationError);
    expect(resolve).toThrow("Custom resource-level roles are not supported yet");
  });

  test.each(["ghost", "constructor"])("should refuse the unknown application role %s", (slug) => {
    // Setup
    const roles = new ApplicationRoles();

    // Action
    const resolve = () => roles.rulesFor(Grant.restore({ slug }));

    // Assert
    expect(resolve).toThrow(EntityNotFoundError);
    expect(resolve).toThrow(`Application role '${slug}' not found`);
    expect(resolve).toThrow(expect.objectContaining({ name: "ApplicationRoleInvalid" }) as Error);
  });
});

describe("ApplicationRoles.projectAdminRules", () => {
  test("should give a project admin the application fallback rules", () => {
    // Setup
    const roles = new ApplicationRoles();

    // Action
    const rules = roles.projectAdminRules();

    // Assert
    expect(rules).toBe(projectAdminApplicationFallbackPermissions);
  });
});
