import { packRules } from "@casl/ability/extra";
import { describe, expect, test } from "vitest";

import { verifyRequestedPermissions } from "./access-approval-request-fns";

describe("verifyRequestedPermissions", () => {
  const makeRule = (action: string, env: string, secretPath: string) => ({
    action,
    subject: "secrets" as const,
    conditions: {
      environment: env,
      secretPath: { $glob: secretPath }
    }
  });

  test("accepts single permission rule", () => {
    const permissions = packRules([makeRule("read", "dev", "/apps/team-a/*")]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
    expect(result.secretPath).toBe("/apps/team-a/*");
    expect(result.accessTypes).toEqual(["Secrets (Read)"]);
  });

  test("accepts multiple rules with same env and path", () => {
    const permissions = packRules([
      makeRule("read", "dev", "/apps/team-a/*"),
      makeRule("edit", "dev", "/apps/team-a/*"),
      makeRule("create", "dev", "/apps/team-a/*")
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
    expect(result.secretPath).toBe("/apps/team-a/*");
    expect(result.accessTypes).toEqual(["Secrets (Read, Edit, Create)"]);
  });

  test("rejects rules with different environments", () => {
    const permissions = packRules([
      makeRule("read", "dev", "/apps/team-a/*"),
      makeRule("read", "prod", "/apps/team-a/*")
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      "All permission rules must target the same environment and secret path"
    );
  });

  test("rejects rules with different secret paths", () => {
    const permissions = packRules([makeRule("read", "dev", "/apps/team-a/*"), makeRule("read", "dev", "/payroll/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      "All permission rules must target the same environment and secret path"
    );
  });

  test("rejects rules with different env and path", () => {
    const permissions = packRules([makeRule("read", "dev", "/apps/team-a/*"), makeRule("read", "prod", "/payroll/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      "All permission rules must target the same environment and secret path"
    );
  });

  test("rejects empty permissions array", () => {
    expect(() => verifyRequestedPermissions({ permissions: [] })).toThrow("No permission provided");
  });

  test("rejects permission without environment", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { secretPath: { $glob: "/test/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects permission without secret path", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { environment: "dev" }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("accepts SecretFolders with a whitelisted action", () => {
    const permissions = packRules([
      {
        action: "create",
        subject: "secret-folders" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
  });

  test("accepts DynamicSecrets with a whitelisted action", () => {
    const permissions = packRules([
      {
        action: "lease",
        subject: "dynamic-secrets" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
  });

  test("accepts SecretRotation with a whitelisted action", () => {
    const permissions = packRules([
      {
        action: "rotate-secrets",
        subject: "secret-rotation" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
  });

  test("accepts SecretImports with a whitelisted action", () => {
    const permissions = packRules([
      {
        action: "edit",
        subject: "secret-imports" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
  });

  test("accepts HoneyTokens with a whitelisted action", () => {
    const permissions = packRules([
      {
        action: "read-credentials",
        subject: "honey-tokens" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    const result = verifyRequestedPermissions({ permissions });
    expect(result.envSlug).toBe("dev");
  });

  test("rejects a subject outside the access-request whitelist", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "member" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "member" is not allowed'
    );
  });

  test("rejects an action excluded from the Secrets whitelist", () => {
    const permissions = packRules([
      {
        action: "describeSecret",
        subject: "secrets" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects an action excluded from the SecretFolders whitelist", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secret-folders" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secret-folders" is not allowed'
    );
  });

  test("rejects an unrecognized condition key", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" }, secretName: "foo" }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects secretPath given as a bare string instead of { $glob }", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { environment: "dev", secretPath: "/test/*" }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects a smuggled multi-subject rule", () => {
    // Hand-crafted packed tuple simulating a request that bypasses packRules() client-side:
    // unpackRules always splits the subject string on ",", so this decodes to two subjects.
    const permissions = [["read", "secrets,member", { environment: "dev", secretPath: { $glob: "/test/*" } }]];
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      "Each permission rule in an access request must target exactly one resource type"
    );
  });

  test("rejects an inverted (cannot) rule", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" } },
        inverted: true
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects a batch mixing a valid rule with a disallowed rule", () => {
    const permissions = packRules([
      makeRule("read", "dev", "/apps/team-a/*"),
      {
        action: "read",
        subject: "kms" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/apps/team-a/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "kms" is not allowed'
    );
  });
});
