import { packRules } from "@casl/ability/extra";
import { describe, expect, test, vi } from "vitest";

// logger is initialized at app boot and is undefined under unit tests; stub it so
// validateHandlebarTemplate's reject path surfaces its BadRequestError rather than a logger error.
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { BadRequestError } from "@app/lib/errors";

// eslint-disable-next-line import/first
import { verifyRequestedPermissions } from "./access-approval-request-fns";

describe("verifyRequestedPermissions", () => {
  const makeRule = (action: string, env: string, secretPath: string, subject = "secrets") => ({
    action,
    subject,
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

  test.each([
    ["secret-folders", "create"],
    ["dynamic-secrets", "lease"],
    ["secret-rotation", "rotate-secrets"],
    ["secret-imports", "edit"],
    ["honey-tokens", "read-credentials"]
  ])("accepts %s with whitelisted action %s", (subject, action) => {
    const permissions = packRules([makeRule(action, "dev", "/apps/team-a/*", subject)]);
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

  test("rejects a secrets action outside ProjectPermissionSecretActions", () => {
    const permissions = packRules([
      {
        action: "lease",
        subject: "secrets" as const,
        conditions: { environment: "dev", secretPath: { $glob: "/test/*" } }
      }
    ]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects a secret-folders action outside ProjectPermissionActions", () => {
    const permissions = packRules([
      {
        action: "readValue",
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
    const permissions = packRules([{ ...makeRule("read", "dev", "/test/*"), inverted: true }]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(
      'The requested permission for resource "secrets" is not allowed'
    );
  });

  test("rejects a rule carrying extra attributes (field scoping, reason)", () => {
    const permissions = packRules([{ ...makeRule("read", "dev", "/test/*"), fields: ["value"], reason: "why" }]);
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

describe("verifyRequestedPermissions: requestedPermissions", () => {
  test("returns subject and action identifiers alongside the humanized list", () => {
    const permissions = packRules([
      {
        action: ["read", "edit"],
        subject: "secrets",
        conditions: { environment: "prod", secretPath: { $glob: "/api/*" } }
      },
      {
        action: ["create"],
        subject: "secret-folders",
        conditions: { environment: "prod", secretPath: { $glob: "/api/*" } }
      }
    ]);

    const result = verifyRequestedPermissions({ permissions });

    expect(result.requestedPermissions).toEqual([
      { subject: "secrets", actions: ["read", "edit"] },
      { subject: "secret-folders", actions: ["create"] }
    ]);
    expect(result.accessTypes).toEqual(["Secrets (Read, Edit)", "Secret Folders (Create)"]);
  });
});

describe("verifyRequestedPermissions input hardening", () => {
  const makeRule = (env: string, secretPath: string) => ({
    action: "read",
    subject: "secrets",
    conditions: {
      environment: env,
      secretPath: { $glob: secretPath }
    }
  });

  test("rejects a handlebars expression in secretPath", () => {
    // interpolatePermissionRules compiles the granted privilege before evaluating it, so a template
    // surviving here would widen the grant at read time.
    const permissions = packRules([makeRule("dev", "/apps/{{identity.auth.kubernetes.namespace}}/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(/Template sanitization failed/);
  });

  test("rejects a handlebars expression in environment", () => {
    const permissions = packRules([makeRule("{{identity.name}}", "/apps/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(/Template sanitization failed/);
  });

  test("rejects an unescaped handlebars expression", () => {
    const permissions = packRules([makeRule("dev", "/apps/{{{identity.name}}}/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(/Template sanitization failed/);
  });

  test("rejects a non-slug environment", () => {
    const permissions = packRules([makeRule("Dev Environment", "/apps/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow();
  });

  test("rejects a padded environment rather than trimming it", () => {
    // The service persists the request body verbatim and copies it into the granted privilege, so a
    // value this schema normalized would be validated as "dev" and granted as " dev ": the request
    // would be approved and the privilege would match no environment at all.
    const permissions = packRules([makeRule(" dev ", "/apps/*")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(BadRequestError);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(/is not allowed/);
  });

  test("rejects an over-long secretPath", () => {
    const permissions = packRules([makeRule("dev", `/${"a".repeat(600)}`)]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow();
  });

  test("rejects an unterminated expression as a bad request, not a parse crash", () => {
    // handlebars.parse throws a plain Error here, which would surface as a 500 unless translated.
    const permissions = packRules([makeRule("dev", "/apps/{{")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(BadRequestError);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(/malformed template expression/);
  });

  test("rejects a block expression as a bad request, not a parse crash", () => {
    const permissions = packRules([makeRule("dev", "/apps/{{#each x}}")]);
    expect(() => verifyRequestedPermissions({ permissions })).toThrow(BadRequestError);
  });

  test("still accepts an ordinary glob path", () => {
    const permissions = packRules([makeRule("dev", "/apps/team-a/*")]);
    expect(verifyRequestedPermissions({ permissions }).secretPath).toBe("/apps/team-a/*");
  });
});
