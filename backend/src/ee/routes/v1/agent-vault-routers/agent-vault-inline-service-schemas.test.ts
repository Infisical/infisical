import { describe, expect, test } from "vitest";

import { AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE } from "@app/ee/services/agent-vault/agent-vault-variable-fns";

import { AgentVaultInlineServicesInputSchema } from "./agent-vault-schemas";

const bearer = (value: string, extra: Record<string, unknown> = {}) => ({
  type: "http",
  hostPattern: "api.example.com",
  credential: { type: "bearer", value },
  ...extra
});

const issuesOf = (input: unknown) => {
  const result = AgentVaultInlineServicesInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
};

describe("inline services request schema", () => {
  test("refuses a variable reference, well formed or not, and names the field without quoting it", () => {
    const [wellFormed] = issuesOf([bearer("Bearer {{GITHUB_TOKEN}}")]);
    expect(wellFormed.message).toBe(AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE);
    expect(wellFormed.path).toEqual([0, "credential", "value"]);
    expect(wellFormed.message).not.toContain("Bearer");

    expect(issuesOf([bearer("{{not a key}}")])[0].message).toBe(AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE);
  });

  test("refuses one in a basic credential, a custom header and a substitution", () => {
    const issues = issuesOf([
      {
        type: "http",
        hostPattern: "api.example.com",
        credential: { type: "basic", username: "{{USER}}", password: "secret" },
        customHeaders: [{ name: "X-Key", value: "{{KEY}}" }],
        substitutions: [{ placeholder: "TEAM", surfaces: ["path"], value: "{{TEAM}}" }]
      }
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([
      [0, "credential", "username"],
      [0, "customHeaders", 0, "value"],
      [0, "substitutions", 0, "value"]
    ]);
  });

  test("accepts braces that don't read as a reference", () => {
    expect(issuesOf([bearer('{"scope":{"read":true}}'), bearer("a {{ b", { hostPattern: "b.example.com" })])).toEqual(
      []
    );
  });

  test("needs a name to be unique, but not present", () => {
    const issues = issuesOf([
      bearer("one", { name: "api" }),
      bearer("two", { name: "api", hostPattern: "b.example.com" }),
      bearer("three", { hostPattern: "c.example.com" })
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual([1, "name"]);
  });

  test("caps the list at 20", () => {
    const services = Array.from({ length: 21 }, (_, index) =>
      bearer("token", { hostPattern: `h${index}.example.com` })
    );
    expect(issuesOf(services)[0]).toMatchObject({
      code: "too_big",
      message:
        "A session can have at most 20 services. Add the others to an access bundle and name it in accessBundles."
    });
  });

  test("needs a half of a basic credential", () => {
    const [issue] = issuesOf([{ type: "http", hostPattern: "api.example.com", credential: { type: "basic" } }]);
    expect(issue.message).toBe("A basic credential needs a username, a password, or both");
  });

  // Refused by name in the session service, which can say why.
  test("passes OAuth and member-provided fields through to be refused by name", () => {
    expect(issuesOf([{ type: "http", hostPattern: "api.example.com", credential: { type: "oauth" } }])).toEqual([]);
    expect(
      issuesOf([
        bearer("token", { credential: { type: "bearer", value: "token", memberProvidedFields: ["credential-value"] } })
      ])
    ).toEqual([]);
  });
});
