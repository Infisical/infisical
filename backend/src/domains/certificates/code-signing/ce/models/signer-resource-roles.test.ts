import { packRules } from "@casl/ability/extra";

import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import {
  projectAdminSignerFallbackPermissions,
  signerAdminPermissions,
  SignerPermissionActions,
  SignerPermissionSub,
  signerOperatorPermissions
} from "./permissions/signer-roles";
import { SignerRoles } from "./signer-resource-roles";

describe("SignerRoles.rulesFor", () => {
  test("should resolve a signer role to its rules", () => {
    // Setup
    const roles = new SignerRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: "operator" }));

    // Assert
    expect(rules).toBe(signerOperatorPermissions);
    expect(roles.resourceType).toBe(ResourceType.Signer);
  });

  test("should let a signer admin revoke certificates", () => {
    // Setup
    const roles = new SignerRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: "admin" }));

    // Assert
    expect(rules).toBe(signerAdminPermissions);
    expect(rules[0].action).toContain(SignerPermissionActions.RevokeCertificate);
  });

  test("should refuse a custom signer role", () => {
    // Setup
    const roles = new SignerRoles();
    const grant = Grant.restore({
      slug: "custom",
      packedRules: packRules([{ action: SignerPermissionActions.Sign, subject: SignerPermissionSub.Signer }])
    });

    // Action
    const resolve = () => roles.rulesFor(grant);

    // Assert
    expect(resolve).toThrow(RuleViolationError);
    expect(resolve).toThrow("Custom resource-level roles are not supported yet");
  });

  test.each(["ghost", "constructor"])("should refuse the unknown signer role %s", (slug) => {
    // Setup
    const roles = new SignerRoles();

    // Action
    const resolve = () => roles.rulesFor(Grant.restore({ slug }));

    // Assert
    expect(resolve).toThrow(EntityNotFoundError);
    expect(resolve).toThrow(`Signer role '${slug}' not found`);
    expect(resolve).toThrow(expect.objectContaining({ name: "SignerRoleInvalid" }) as Error);
  });
});

describe("SignerRoles.projectAdminRules", () => {
  test("should give a project admin read and member management on any signer", () => {
    // Setup
    const roles = new SignerRoles();

    // Action
    const rules = roles.projectAdminRules();

    // Assert
    expect(rules).toBe(projectAdminSignerFallbackPermissions);
  });
});
