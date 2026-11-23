import { describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "../agent-vault/agent-vault-credential-schemas";
import { AgentVaultHttpMethod, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import {
  AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE,
  AgentVaultHookSecretSchema,
  AgentVaultHookUrlSchema,
  AgentVaultServiceHookInputSchema,
  assertAgentVaultHooksOnPlan,
  assertHookNarrowingFitsService,
  isServiceHookChange,
  pickHookNarrowing,
  toServiceHookColumns
} from "./agent-vault-hook-fns";

const HOOK_ID = "11111111-1111-4111-8111-111111111111";
const MIX_MESSAGE = "A hook narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both.";

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

describe("a service's hook", () => {
  test.each([
    { why: "a whole service", hook: { name: "guard" } },
    { why: "methods and paths", hook: { name: "guard", methods: ["PUT"], paths: ["/repos"] } },
    { why: "tools", hook: { name: "guard", tools: ["delete_issue"] } }
  ])("accepts $why", ({ hook }) => {
    expect(AgentVaultServiceHookInputSchema.safeParse(hook).success).toBe(true);
  });

  test("dedupes methods, normalises path prefixes and lowercases the name", () => {
    expect(
      AgentVaultServiceHookInputSchema.parse({ name: " Guard ", methods: ["PUT", "PUT"], paths: ["/repos/"] })
    ).toEqual({ name: "guard", methods: ["PUT"], paths: ["/repos"] });
  });

  test.each([
    { why: "tools with methods", hook: { name: "x", methods: ["GET"], tools: ["a"] }, message: MIX_MESSAGE },
    { why: "tools with paths", hook: { name: "x", paths: ["/a"], tools: ["a"] }, message: MIX_MESSAGE },
    { why: "an empty name", hook: { name: "  " }, message: "Enter the name of the hook." },
    {
      why: "a name longer than a hook name",
      hook: { name: "a".repeat(65) },
      message: "A hook name can be at most 64 characters."
    },
    {
      why: "an empty method list",
      hook: { name: "x", methods: [] },
      message: "List at least one method, or leave 'methods' out to check every method."
    },
    {
      why: "an empty tool list",
      hook: { name: "x", tools: [] },
      message: "List at least one tool, or leave 'tools' out to check every tool."
    },
    {
      why: "too many tools",
      hook: { name: "x", tools: Array.from({ length: 101 }, (_, index) => `t${index}`) },
      message: "A service's hook can list at most 100 tools."
    },
    { why: "a duplicate tool", hook: { name: "x", tools: ["a", "a"] }, message: '"a" is listed twice.' },
    { why: "a relative path", hook: { name: "x", paths: ["repos"] }, message: '"repos" must start with a /.' }
  ])("refuses $why", ({ hook, message }) => {
    expect(issuesOf(AgentVaultServiceHookInputSchema.safeParse(hook))).toEqual([message]);
  });

  test("a hook without a name is refused", () => {
    expect(AgentVaultServiceHookInputSchema.safeParse({ methods: ["GET"] }).success).toBe(false);
  });

  test.each([
    {
      why: "methods on an MCP service",
      narrowing: { methods: [AgentVaultHttpMethod.Get] },
      service: { name: "linear", type: AgentVaultServiceType.Mcp },
      message:
        "'linear' is an MCP service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it."
    },
    {
      why: "tools on an HTTP service",
      narrowing: { tools: ["x"] },
      service: { name: "github", type: AgentVaultServiceType.Http },
      message:
        "'github' is an HTTP service, and only an MCP service can be narrowed by tools. Leave them out to check every request to it."
    },
    {
      why: "paths on a database service",
      narrowing: { paths: ["/a"] },
      service: { name: "warehouse", type: AgentVaultServiceType.Postgres },
      message:
        "'warehouse' is a PostgreSQL service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it."
    }
  ])("refuses $why for the service's type", ({ narrowing, service, message }) => {
    expect(() => assertHookNarrowingFitsService(narrowing, service)).toThrow(message);
  });

  test("a database service takes a hook with no narrowing", () => {
    expect(() =>
      assertHookNarrowingFitsService({}, { name: "warehouse", type: AgentVaultServiceType.Postgres })
    ).not.toThrow();
  });

  test("every write sets all four columns, so a narrowing never outlives its hook", () => {
    expect(toServiceHookColumns(HOOK_ID, { tools: ["t"] })).toEqual({
      hookId: HOOK_ID,
      hookMethods: null,
      hookPaths: null,
      hookTools: ["t"]
    });
  });

  test("reads leave out a narrowing that isn't set", () => {
    expect(pickHookNarrowing({ hookMethods: ["GET"], hookPaths: null, hookTools: null })).toEqual({ methods: ["GET"] });
  });

  describe("isServiceHookChange", () => {
    const row = { hookId: HOOK_ID, hookMethods: ["GET"], hookPaths: null, hookTools: null };

    test("the same hook and narrowing is no change", () => {
      expect(isServiceHookChange({ id: HOOK_ID, methods: [AgentVaultHttpMethod.Get] }, row)).toBe(false);
    });

    test.each([
      {
        why: "another hook",
        hook: { id: "22222222-2222-4222-8222-222222222222", methods: [AgentVaultHttpMethod.Get] }
      },
      { why: "a wider narrowing", hook: { id: HOOK_ID } },
      { why: "another narrowing", hook: { id: HOOK_ID, methods: [AgentVaultHttpMethod.Post] } }
    ])("$why is a change", ({ hook }) => {
      expect(isServiceHookChange(hook, row)).toBe(true);
    });

    test("reordered or repeated methods are no change", () => {
      const twoMethods = { ...row, hookMethods: ["GET", "POST"] };
      const reordered = [AgentVaultHttpMethod.Post, AgentVaultHttpMethod.Get, AgentVaultHttpMethod.Post];
      expect(isServiceHookChange({ id: HOOK_ID, methods: reordered }, twoMethods)).toBe(false);
    });

    test("a service with no hook changes when given one", () => {
      expect(isServiceHookChange({ id: HOOK_ID }, { hookId: null })).toBe(true);
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
