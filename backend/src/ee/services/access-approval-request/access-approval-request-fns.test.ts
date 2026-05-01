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
    expect(result.accessTypes).toEqual(["Read Access"]);
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
    expect(result.accessTypes).toContain("Read Access");
    expect(result.accessTypes).toContain("Edit Access");
    expect(result.accessTypes).toContain("Create Access");
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
    expect(() => verifyRequestedPermissions({ permissions })).toThrow("Permission environment is not a string");
  });

  test("rejects permission without secret path", () => {
    const permissions = packRules([
      {
        action: "read",
        subject: "secrets" as const,
        conditions: { environment: "dev" }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow("Permission path is not a string");
  });
});
