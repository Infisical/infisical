import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "../agent-vault/agent-vault-credential-schemas";
import { AgentVaultHttpMethod, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import {
  AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE,
  AgentVaultHookRuleSchema,
  AgentVaultHookRulesSchema,
  AgentVaultHookSecretSchema,
  AgentVaultHookServiceNarrowingUpdateSchema,
  AgentVaultHookUrlSchema,
  assertAgentVaultHooksOnPlan,
  groupHookRuleViews,
  toHookServiceLinks,
  toResolvedHookRules
} from "./agent-vault-hook-fns";

const SERVICE_ID = "11111111-1111-4111-8111-111111111111";
const MIX_MESSAGE = "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both.";

const issuesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.message);

describe("hook URL", () => {
  test.each([
    "https://hooks.example.com/agent-vault",
    "http://10.0.0.5:8080/hook",
    "https://hooks.example.com/agent-vault/stripe-prod",
    "https://hooks.example.com/a%20b"
  ])("accepts %s", (url) => {
    expect(AgentVaultHookUrlSchema.parse(url)).toBe(url);
  });

  test.each([
    { url: "", message: "Enter the hook URL." },
    { url: `https://x.example.com/${"a".repeat(2049 - 22)}`, message: "The hook URL can be at most 2048 characters." },
    {
      url: "ftp://x",
      message: "The hook URL must start with https:// or http://, as in https://hooks.example.com/agent-vault."
    },
    {
      url: "https:host",
      message: "The hook URL must start with https:// or http://, as in https://hooks.example.com/agent-vault."
    },
    { url: "https://user:pass@x", message: "The hook URL can't contain a username or password." },
    { url: "https://x/#a", message: "The hook URL can't contain a fragment (the part after #)." },
    { url: "https://x/?a=1", message: "Hook URLs can't include a query string." },
    { url: "https://x/{{KEY}}", message: "Variables aren't supported in the hook URL. Enter the URL itself." },
    { url: "https://x/a b", message: "The hook URL can't contain spaces." },
    { url: "https://x/a\nb", message: AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE },
    { url: "https://x/\uD800", message: "The hook URL contains invalid text. Copy the URL and try again." },
    {
      url: "https://hooks.example.com\\agent-vault",
      message: "Enter a URL without backslashes or stray % signs, as in https://hooks.example.com/agent-vault."
    },
    {
      url: "https://ex%61mple.com/hook",
      message: "Enter a URL without backslashes or stray % signs, as in https://hooks.example.com/agent-vault."
    },
    {
      url: "https://hooks.example.com/a%zz",
      message: "Enter a URL without backslashes or stray % signs, as in https://hooks.example.com/agent-vault."
    },
    {
      url: "https:///hook",
      message: "The hook URL isn't a valid URL. Enter the full address, as in https://hooks.example.com/agent-vault."
    }
  ])("refuses $url", ({ url, message }) => {
    expect(issuesOf(AgentVaultHookUrlSchema.safeParse(url))).toEqual([message]);
  });

  test("the over-long case is 2049 characters", () => {
    expect(`https://x.example.com/${"a".repeat(2049 - 22)}`).toHaveLength(2049);
  });
});

describe("hook secret", () => {
  test.each([
    { why: "32 characters", value: "a".repeat(32) },
    { why: "512 characters", value: "b".repeat(512) },
    { why: "braces", value: `{{${"c".repeat(30)}}}` },
    { why: "every printable symbol", value: `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~0123456789` }
  ])("accepts $why", ({ value }) => {
    expect(AgentVaultHookSecretSchema.parse(value)).toBe(value);
  });

  test.each([
    { why: "empty", value: "", message: "Enter a secret for the hook." },
    { why: "31 characters", value: "a".repeat(31), message: "The hook secret must be at least 32 characters." },
    { why: "513 characters", value: "a".repeat(513), message: "The hook secret can be at most 512 characters." },
    {
      why: "a space",
      value: `${"a".repeat(20)} ${"a".repeat(20)}`,
      message: "The hook secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a tab",
      value: `${"a".repeat(20)}\t${"a".repeat(20)}`,
      message: "The hook secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a non-ASCII letter",
      value: `${"a".repeat(40)}é`,
      message: "The hook secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a lone surrogate",
      value: `${"a".repeat(40)}\uD800`,
      message: "The hook secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a short value with a space reports only the characters",
      value: "a b",
      message: "The hook secret can only use letters, numbers and symbols, with no spaces."
    }
  ])("refuses $why with one issue", ({ value, message }) => {
    expect(issuesOf(AgentVaultHookSecretSchema.safeParse(value))).toEqual([message]);
  });

  test("is never trimmed", () => {
    expect(AgentVaultHookSecretSchema.safeParse(` ${"a".repeat(40)} `).success).toBe(false);
  });
});

describe("hook rules", () => {
  test.each([
    { why: "a whole service", rule: { service: "github" } },
    { why: "methods and paths", rule: { service: "github", methods: ["PUT"], paths: ["/repos"] } },
    { why: "tools", rule: { service: "linear", tools: ["delete_issue"] } }
  ])("accepts $why", ({ rule }) => {
    expect(AgentVaultHookRuleSchema.safeParse(rule).success).toBe(true);
  });

  test("dedupes methods, normalises path prefixes and lowercases the name", () => {
    expect(
      AgentVaultHookRuleSchema.parse({ service: " GitHub ", methods: ["PUT", "PUT"], paths: ["/repos/"] })
    ).toEqual({ service: "github", methods: ["PUT"], paths: ["/repos"] });
  });

  test("drops a service ID, which the API no longer takes", () => {
    expect(AgentVaultHookRuleSchema.parse({ service: "github", serviceId: SERVICE_ID })).toEqual({ service: "github" });
  });

  test.each([
    { why: "tools with methods", rule: { service: "x", methods: ["GET"], tools: ["a"] }, message: MIX_MESSAGE },
    { why: "tools with paths", rule: { service: "x", paths: ["/a"], tools: ["a"] }, message: MIX_MESSAGE },
    {
      why: "an empty service",
      rule: { service: "  " },
      message: "Enter the name of the service this rule applies to."
    },
    {
      why: "a name longer than a service name",
      rule: { service: "a".repeat(65) },
      message: "A service name in a rule can be at most 64 characters."
    },
    {
      why: "an empty method list",
      rule: { service: "x", methods: [] },
      message: "List at least one method, or leave 'methods' out to match every method."
    },
    {
      why: "an empty tool list",
      rule: { service: "x", tools: [] },
      message: "List at least one tool, or leave 'tools' out to match every tool."
    },
    {
      why: "too many tools",
      rule: { service: "x", tools: Array.from({ length: 101 }, (_, index) => `t${index}`) },
      message: "A rule can list at most 100 tools."
    },
    {
      why: "a duplicate tool",
      rule: { service: "x", tools: ["a", "a"] },
      message: '"a" is listed twice.'
    },
    {
      why: "a relative path",
      rule: { service: "x", paths: ["repos"] },
      message: '"repos" must start with a /.'
    }
  ])("refuses $why", ({ rule, message }) => {
    expect(issuesOf(AgentVaultHookRuleSchema.safeParse(rule))).toEqual([message]);
  });

  test("a rule without a service is refused", () => {
    expect(AgentVaultHookRuleSchema.safeParse({ methods: ["GET"] }).success).toBe(false);
  });

  test("an empty rule list is allowed and means every request", () => {
    expect(AgentVaultHookRulesSchema.parse([])).toEqual([]);
  });

  test("at most 50 rules", () => {
    const rules = Array.from({ length: 51 }, (_, index) => ({ service: `s${index}` }));
    expect(issuesOf(AgentVaultHookRulesSchema.safeParse(rules))).toEqual(["A hook can have at most 50 rules."]);
  });

  test("each service once, however its name is cased", () => {
    expect(
      issuesOf(
        AgentVaultHookRulesSchema.safeParse([{ service: "github" }, { service: "linear" }, { service: "GitHub" }])
      )
    ).toEqual([
      "'github' is in more than one rule. List each service once, with all its methods, paths or tools in that rule."
    ]);
  });

  test("a narrowing PATCH needs a field, and null clears one", () => {
    expect(AgentVaultHookServiceNarrowingUpdateSchema.safeParse({}).success).toBe(false);
    expect(AgentVaultHookServiceNarrowingUpdateSchema.parse({ methods: null })).toEqual({ methods: null });
  });
});

describe("hook rule services", () => {
  const OTHER_ID = "22222222-2222-4222-8222-222222222222";
  const services = [
    { id: SERVICE_ID, name: "github", type: AgentVaultServiceType.Http },
    { id: OTHER_ID, name: "linear", type: AgentVaultServiceType.Mcp },
    { id: "33333333-3333-4333-8333-333333333333", name: "warehouse", type: AgentVaultServiceType.Postgres }
  ];

  test("on save, each rule becomes a link to the service it names, in rule order", () => {
    expect(
      toHookServiceLinks(
        [
          { service: "linear", tools: ["x"] },
          { service: "github", methods: [AgentVaultHttpMethod.Put] },
          { service: "warehouse" }
        ],
        services
      )
    ).toEqual([
      { serviceId: OTHER_ID, position: 0, methods: null, paths: null, tools: ["x"] },
      { serviceId: SERVICE_ID, position: 1, methods: ["PUT"], paths: null, tools: null },
      { serviceId: services[2].id, position: 2, methods: null, paths: null, tools: null }
    ]);
  });

  test("on save, a name that isn't one of the project's services is a 404 naming it", () => {
    expect(() => toHookServiceLinks([{ service: "github" }, { service: "inline-api" }], services)).toThrow(
      "There's no service called 'inline-api' in this project. A hook rule can only name one of the project's services."
    );
  });

  test.each([
    {
      why: "methods on an MCP service",
      rule: { service: "linear", methods: [AgentVaultHttpMethod.Get] },
      message:
        "'linear' is an MCP service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it."
    },
    {
      why: "tools on an HTTP service",
      rule: { service: "github", tools: ["x"] },
      message:
        "'github' is an HTTP service, and only an MCP service can be narrowed by tools. Leave them out to check every request to it."
    },
    {
      why: "paths on a database service",
      rule: { service: "warehouse", paths: ["/a"] },
      message:
        "'warehouse' is a PostgreSQL service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it."
    }
  ])("on save, refuses $why", ({ rule, message }) => {
    expect(() => toHookServiceLinks([rule], services)).toThrow(message);
  });

  test("reads show each hook's rules by the service's current name, in rule order", () => {
    const link = { serviceType: AgentVaultServiceType.Http, methods: null, paths: null, tools: null };
    expect(
      groupHookRuleViews([
        { ...link, hookId: "h1", serviceId: OTHER_ID, serviceName: "second", position: 1, tools: ["t"] },
        { ...link, hookId: "h1", serviceId: SERVICE_ID, serviceName: "first", position: 0, paths: ["/repos"] },
        { ...link, hookId: "h2", serviceId: SERVICE_ID, serviceName: "first", position: 0 }
      ])
    ).toEqual(
      new Map([
        [
          "h1",
          [
            { service: "first", paths: ["/repos"] },
            { service: "second", tools: ["t"] }
          ]
        ],
        ["h2", [{ service: "first" }]]
      ])
    );
  });

  describe("resolve", () => {
    const names = new Map([[SERVICE_ID, "github"]]);
    const link = (serviceId: string) => ({ serviceId, methods: ["GET"], paths: null, tools: null });

    test("sends the services in the session by name and leaves the rest out", () => {
      expect(
        toResolvedHookRules({ links: [link(SERVICE_ID), link(OTHER_ID)], appliesToAllServices: false }, names)
      ).toEqual([{ service: "github", methods: ["GET"] }]);
    });

    test("sends no hook when none of its services is in the session", () => {
      expect(toResolvedHookRules({ links: [link(OTHER_ID)], appliesToAllServices: false }, names)).toBeUndefined();
    });

    test("sends no hook for one left without services", () => {
      expect(toResolvedHookRules({ links: [], appliesToAllServices: false }, names)).toBeUndefined();
    });

    test("sends no rules, so every request is checked, for a hook saved without services", () => {
      expect(toResolvedHookRules({ links: [], appliesToAllServices: true }, names)).toEqual([]);
    });
  });
});

describe("assertAgentVaultHooksOnPlan", () => {
  test("throws the plan message when hooks are off", async () => {
    const licenseService = {
      getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: false }))
    };
    await expect(assertAgentVaultHooksOnPlan(licenseService as never, "org-1")).rejects.toThrow(
      AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
    );
    expect(licenseService.getPlan).toHaveBeenCalledWith("org-1");
  });

  test("passes when hooks are on", async () => {
    const licenseService = {
      getPlan: vi.fn().mockResolvedValue(Plan.restore({ ...testFeatures(), agentVaultHooks: true }))
    };
    await expect(assertAgentVaultHooksOnPlan(licenseService as never, "org-1")).resolves.toBeUndefined();
  });
});
