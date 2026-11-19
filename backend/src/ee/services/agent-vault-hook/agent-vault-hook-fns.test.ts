import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "../agent-vault/agent-vault-credential-schemas";
import {
  AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE,
  AgentVaultHookRuleSchema,
  AgentVaultHookRulesSchema,
  AgentVaultHookSecretSchema,
  AgentVaultHookUrlSchema,
  assertAgentVaultHooksOnPlan,
  isAgentVaultHooksOnPlanForResolve,
  toHookRules
} from "./agent-vault-hook-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

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
    { why: "tools", rule: { service: "linear", tools: ["delete_issue"] } },
    { why: "an unnamed inline service by its host", rule: { service: "api.example.com" } }
  ])("accepts $why", ({ rule }) => {
    expect(AgentVaultHookRuleSchema.safeParse(rule).success).toBe(true);
  });

  test("dedupes methods and normalises path prefixes", () => {
    expect(
      AgentVaultHookRuleSchema.parse({ service: " github ", methods: ["PUT", "PUT"], paths: ["/repos/"] })
    ).toEqual({ service: "github", methods: ["PUT"], paths: ["/repos"] });
  });

  test.each([
    {
      why: "tools with methods",
      rule: { service: "x", methods: ["GET"], tools: ["a"] },
      message:
        "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both. Split it into two rules."
    },
    {
      why: "tools with paths",
      rule: { service: "x", paths: ["/a"], tools: ["a"] },
      message:
        "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both. Split it into two rules."
    },
    {
      why: "an empty service",
      rule: { service: "  " },
      message: "Enter the name of the service this rule applies to."
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

  test("an empty rule list is allowed and means every request", () => {
    expect(AgentVaultHookRulesSchema.parse([])).toEqual([]);
  });

  test("at most 50 rules", () => {
    const rules = Array.from({ length: 51 }, (_, index) => ({ service: `s${index}` }));
    expect(issuesOf(AgentVaultHookRulesSchema.safeParse(rules))).toEqual(["A hook can have at most 50 rules."]);
  });

  test("toHookRules keeps only the rule fields", () => {
    expect(toHookRules([{ service: "a", tools: ["t"], extra: true }, { service: "b" }])).toEqual([
      { service: "a", tools: ["t"] },
      { service: "b" }
    ]);
    expect(toHookRules(null)).toEqual([]);
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

describe("isAgentVaultHooksOnPlanForResolve", () => {
  test("follows the org's plan", async () => {
    const on = new FakeLicenseService().setPlan("org-1", { agentVaultHooks: true });
    const off = new FakeLicenseService().setPlan("org-1", { agentVaultHooks: false });
    expect(await isAgentVaultHooksOnPlanForResolve(on, "org-1")).toBe(true);
    expect(await isAgentVaultHooksOnPlanForResolve(off, "org-1")).toBe(false);
  });

  test("on a fallback plan, the last known plan decides, and with none the hook stays", async () => {
    const licenseService = new FakeLicenseService().setPlan("org-1", { agentVaultHooks: false });
    licenseService.fallbackOrgs.add("org-1");
    expect(await isAgentVaultHooksOnPlanForResolve(licenseService, "org-1")).toBe(true);

    licenseService.lastKnown.set("org-1", {
      plan: { ...testFeatures(), agentVaultHooks: false },
      fetchedAt: Date.now()
    });
    expect(await isAgentVaultHooksOnPlanForResolve(licenseService, "org-1")).toBe(false);
  });

  test("keeps the hook when the plan can't be read", async () => {
    const licenseService = {
      getPlan: vi.fn().mockRejectedValue(new Error("license server down")),
      getLastKnownPlan: vi.fn()
    };
    expect(await isAgentVaultHooksOnPlanForResolve(licenseService as never, "org-1")).toBe(true);
  });
});
