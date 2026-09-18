import { describe, expect, test } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";

import { compileUsernameTemplate, toSafeUsername } from "./templateUtils";

describe("compileUsernameTemplate", () => {
  test("renders the identity name when it is a plain identifier", () => {
    expect(
      compileUsernameTemplate({
        usernameTemplate: "{{identity.name}}",
        randomUsername: "unused",
        identity: { name: "myservice" },
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toBe("myservice");
  });

  test("allows letters, digits, underscore and hyphen", () => {
    expect(
      compileUsernameTemplate({
        usernameTemplate: "{{identity.name}}",
        randomUsername: "unused",
        identity: { name: "my_service-01" },
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toBe("my_service-01");
  });

  test("allows hyphenated system-generated usernames (e.g. the kubernetes prefix)", () => {
    // Hyphens must stay permitted here: system-generated usernames use them (the kubernetes
    // provider prepends "dynamic-secret-sa-"). Do not tighten this to exclude hyphens.
    expect(
      compileUsernameTemplate({
        usernameTemplate: "{{randomUsername}}",
        randomUsername: "dynamic-secret-sa-abc123",
        identity: null,
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toBe("dynamic-secret-sa-abc123");
  });

  test("normalizes the dynamic secret name used in a template", () => {
    expect(
      compileUsernameTemplate({
        usernameTemplate: "{{dynamicSecret.name}}",
        randomUsername: "unused",
        identity: null,
        dynamicSecret: { name: "my secret", type: "sql-database" } as unknown as TDynamicSecrets,
        unixTimestamp: 1700000000
      })
    ).toBe("my_secret");
  });

  test("applies the toUpperCase option", () => {
    expect(
      compileUsernameTemplate({
        usernameTemplate: "{{randomUsername}}",
        randomUsername: "abc123",
        identity: null,
        dynamicSecret: null,
        unixTimestamp: 1700000000,
        options: { toUpperCase: true }
      })
    ).toBe("ABC123");
  });

  test.each([
    ["semicolon", "svc;more"],
    ["whitespace", "svc more"],
    ["single quote", "svc'x"],
    ["double quote", 'svc"x'],
    ["parentheses", "svc(x)"]
  ])("rejects a compiled username containing a %s", (_label, name) => {
    expect(() =>
      compileUsernameTemplate({
        usernameTemplate: "{{identity.name}}",
        randomUsername: "unused",
        identity: { name },
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toThrow("unsupported characters");
  });

  test("rejects a compiled username longer than 128 characters", () => {
    expect(() =>
      compileUsernameTemplate({
        usernameTemplate: "{{identity.name}}",
        randomUsername: "unused",
        identity: { name: "a".repeat(129) },
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toThrow("unsupported characters");
  });

  test("rejects an empty compiled username", () => {
    expect(() =>
      compileUsernameTemplate({
        usernameTemplate: "{{random 0}}",
        randomUsername: "unused",
        identity: null,
        dynamicSecret: null,
        unixTimestamp: 1700000000
      })
    ).toThrow("unsupported characters");
  });
});

describe("toSafeUsername", () => {
  test("leaves a plain identifier unchanged", () => {
    expect(toSafeUsername("build_agent01")).toBe("build_agent01");
  });

  test("replaces disallowed characters with underscore", () => {
    expect(toSafeUsername("name with spaces")).toBe("name_with_spaces");
    expect(toSafeUsername("a.b@c")).toBe("a_b_c");
  });

  test("keeps letters, digits, underscore and hyphen", () => {
    expect(toSafeUsername("ci-runner_01")).toBe("ci-runner_01");
  });

  test("caps the result at 63 characters", () => {
    expect(toSafeUsername("a".repeat(100))).toHaveLength(63);
  });

  test("falls back to a default when nothing remains", () => {
    expect(toSafeUsername("")).toBe("inf_user");
  });
});
