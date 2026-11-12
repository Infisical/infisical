import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "./agent-vault-credential-schemas";
import {
  AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE,
  AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE,
  AgentVaultHookSigningSecretSchema,
  AgentVaultHookUrlSchema,
  assertAgentVaultHooksOnPlan,
  classifyHookUpdate,
  describeHookChange
} from "./agent-vault-hook-fns";

const issuesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.message);

describe("hook URL", () => {
  test.each([
    "https://hooks.example.com/agent-vault",
    "http://10.0.0.5:8080/hook",
    "https://hooks.example.com/agent-vault/stripe-prod"
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
    { url: "https://x/\uD800", message: "The hook URL contains invalid text. Copy the URL and try again." }
  ])("refuses $url", ({ url, message }) => {
    expect(issuesOf(AgentVaultHookUrlSchema.safeParse(url))).toEqual([message]);
  });

  test("the over-long case is 2049 characters", () => {
    expect(`https://x.example.com/${"a".repeat(2049 - 22)}`).toHaveLength(2049);
  });
});

describe("hook signing secret", () => {
  test.each([
    { why: "32 characters", value: "a".repeat(32) },
    { why: "512 characters", value: "b".repeat(512) },
    { why: "braces", value: `{{${"c".repeat(30)}}}` },
    { why: "every printable symbol", value: `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~0123456789` }
  ])("accepts $why", ({ value }) => {
    expect(AgentVaultHookSigningSecretSchema.parse(value)).toBe(value);
  });

  test.each([
    { why: "empty", value: "", message: AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE },
    { why: "31 characters", value: "a".repeat(31), message: "The signing secret must be at least 32 characters." },
    { why: "513 characters", value: "a".repeat(513), message: "The signing secret can be at most 512 characters." },
    {
      why: "a space",
      value: `${"a".repeat(20)} ${"a".repeat(20)}`,
      message: "The signing secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a tab",
      value: `${"a".repeat(20)}\t${"a".repeat(20)}`,
      message: "The signing secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a non-ASCII letter",
      value: `${"a".repeat(40)}é`,
      message: "The signing secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a lone surrogate",
      value: `${"a".repeat(40)}\uD800`,
      message: "The signing secret can only use letters, numbers and symbols, with no spaces."
    },
    {
      why: "a short value with a space reports only the characters",
      value: "a b",
      message: "The signing secret can only use letters, numbers and symbols, with no spaces."
    }
  ])("refuses $why with one issue", ({ value, message }) => {
    expect(issuesOf(AgentVaultHookSigningSecretSchema.safeParse(value))).toEqual([message]);
  });

  test("is never trimmed", () => {
    expect(AgentVaultHookSigningSecretSchema.safeParse(` ${"a".repeat(40)} `).success).toBe(false);
  });
});

describe("classifyHookUpdate", () => {
  const stored = "https://hooks.example.com/a";
  const secret = "s".repeat(32);

  test("undefined leaves the hook alone", () => {
    expect(classifyHookUpdate(undefined, stored)).toBeUndefined();
    expect(classifyHookUpdate(undefined, null)).toBeUndefined();
  });

  test("null removes a stored hook and echoes when there is none", () => {
    expect(classifyHookUpdate(null, stored)).toEqual({ kind: "removed" });
    expect(classifyHookUpdate(null, null)).toBeUndefined();
  });

  test("a hook on a service with none is set", () => {
    expect(classifyHookUpdate({ url: stored, signingSecret: secret }, null)).toEqual({
      kind: "set",
      url: stored,
      signingSecret: secret
    });
  });

  test("setting a hook without a secret is refused", () => {
    expect(() => classifyHookUpdate({ url: stored }, null)).toThrow(BadRequestError);
    expect(() => classifyHookUpdate({ url: stored }, undefined)).toThrow(
      AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE
    );
  });

  test("the stored URL with no secret is an echo", () => {
    expect(classifyHookUpdate({ url: stored }, stored)).toBeUndefined();
  });

  test.each([
    { why: "same URL, new secret", sent: { url: stored, signingSecret: secret } },
    { why: "new URL, no secret", sent: { url: "https://hooks.example.com/b" } },
    { why: "new URL, new secret", sent: { url: "https://hooks.example.com/b", signingSecret: secret } }
  ])("$why is an update", ({ sent }) => {
    expect(classifyHookUpdate(sent, stored)).toEqual({ kind: "updated", ...sent });
  });
});

describe("describeHookChange", () => {
  const locked = "https://hooks.example.com/a";

  test("set names the URL and a new secret", () => {
    expect(describeHookChange({ kind: "set", url: locked, signingSecret: "x" }, null)).toEqual({
      hookChanged: "set",
      hookUrl: locked,
      hookSecretReplaced: true
    });
  });

  test("removed names neither", () => {
    expect(describeHookChange({ kind: "removed" }, locked)).toEqual({
      hookChanged: "removed",
      hookSecretReplaced: false
    });
  });

  test("a secret-only update has no URL", () => {
    expect(describeHookChange({ kind: "updated", url: locked, signingSecret: "x" }, locked)).toEqual({
      hookChanged: "updated",
      hookUrl: undefined,
      hookSecretReplaced: true
    });
  });

  test("a URL-only update names the new URL and keeps the secret", () => {
    expect(describeHookChange({ kind: "updated", url: "https://hooks.example.com/b" }, locked)).toEqual({
      hookChanged: "updated",
      hookUrl: "https://hooks.example.com/b",
      hookSecretReplaced: false
    });
  });
});

describe("assertAgentVaultHooksOnPlan", () => {
  test("throws the plan message when hooks are off", async () => {
    const licenseService = { getPlan: vi.fn().mockResolvedValue({ agentVaultHooks: false }) };
    await expect(assertAgentVaultHooksOnPlan(licenseService as never, "org-1")).rejects.toThrow(
      AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE
    );
    expect(licenseService.getPlan).toHaveBeenCalledWith("org-1");
  });

  test("passes when hooks are on", async () => {
    const licenseService = { getPlan: vi.fn().mockResolvedValue({ agentVaultHooks: true }) };
    await expect(assertAgentVaultHooksOnPlan(licenseService as never, "org-1")).resolves.toBeUndefined();
  });
});
