import { describe, expect, it } from "vitest";

import { AgentVaultHttpMethod, AgentVaultServiceType } from "@app/hooks/api/agentVault";
import { AgentVaultHookMode } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { UNCHANGED_SECRET } from "../service-sheet/serviceSchema";
import {
  blankHookRule,
  buildCreateHookRequest,
  buildHookRule,
  buildUpdateHookRequest,
  describeHookRule,
  hookFormOf,
  hookFormSchema,
  hookRuleDraftOf,
  hookSecretError,
  hookUrlError,
  THookForm
} from "./hookSchema";

const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);

const storedHook: TAgentVaultHook = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "approvals",
  description: null,
  url: HOOK_URL,
  mode: AgentVaultHookMode.Gate,
  rules: [{ service: "github", methods: [AgentVaultHttpMethod.Put] }],
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z"
};

const form = (overrides: Partial<THookForm> = {}): THookForm => ({
  name: "approvals",
  description: "",
  url: HOOK_URL,
  secret: SECRET,
  rules: [],
  ...overrides
});

const issuesOf = (data: THookForm) => {
  const result = hookFormSchema().safeParse(data);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
};

describe("hookUrlError, which mirrors the API's hook URL rule", () => {
  it("accepts https and http URLs with a path", () => {
    expect(hookUrlError("https://hooks.example.com/agent-vault")).toBeNull();
    expect(hookUrlError(" http://10.0.0.5:8080/check ")).toBeNull();
  });

  it("refuses what the API refuses, with its message", () => {
    expect(hookUrlError("")).toBe("Enter the hook URL.");
    expect(hookUrlError(`https://hooks.example.com/${"a".repeat(2048)}`)).toBe(
      "The hook URL can be at most 2048 characters."
    );
    expect(hookUrlError("https://hooks.example.com/a b")).toBe(
      "The hook URL can't contain spaces."
    );
    expect(hookUrlError("https://hooks.example.com/{{TOKEN}}")).toBe(
      "Variables aren't supported in the hook URL. Enter the URL itself."
    );
    expect(hookUrlError("ftp://hooks.example.com")).toBe(
      "The hook URL must start with https:// or http://, as in https://hooks.example.com/agent-vault."
    );
    expect(hookUrlError("https:hooks.example.com")).toBe(
      "The hook URL must start with https:// or http://, as in https://hooks.example.com/agent-vault."
    );
    expect(hookUrlError("https://")).toBe(
      "The hook URL isn't a valid URL. Enter the full address, as in https://hooks.example.com/agent-vault."
    );
    expect(hookUrlError("https://user:pass@hooks.example.com/check")).toBe(
      "The hook URL can't contain a username or password."
    );
    expect(hookUrlError("https://hooks.example.com/check#top")).toBe(
      "The hook URL can't contain a fragment (the part after #)."
    );
    expect(hookUrlError("https://hooks.example.com/check?token=1")).toBe(
      "Hook URLs can't include a query string."
    );
  });

  it("refuses backslashes, stray % signs, a % in the host and an empty host", () => {
    const strayMessage =
      "Enter a URL without backslashes or stray % signs, as in https://hooks.example.com/agent-vault.";
    expect(hookUrlError("https://hooks.example.com\\agent-vault")).toBe(strayMessage);
    expect(hookUrlError("https://ex%61mple.com/hook")).toBe(strayMessage);
    expect(hookUrlError("https://hooks.example.com/a%zz")).toBe(strayMessage);
    expect(hookUrlError("https:///hook")).toBe(
      "The hook URL isn't a valid URL. Enter the full address, as in https://hooks.example.com/agent-vault."
    );
    expect(hookUrlError("https://hooks.example.com/a%20b")).toBeNull();
  });
});

describe("hookSecretError, which mirrors the API's hook secret rule", () => {
  it("refuses an empty, short or long secret and anything but printable ASCII, without trimming", () => {
    expect(hookSecretError("")).toBe("Enter a secret for the hook.");
    expect(hookSecretError("a".repeat(31))).toBe("The hook secret must be at least 32 characters.");
    expect(hookSecretError(`${"a".repeat(32)} `)).toBe(
      "The hook secret can only use letters, numbers and symbols, with no spaces."
    );
    expect(hookSecretError(`${"a".repeat(32)}é`)).toBe(
      "The hook secret can only use letters, numbers and symbols, with no spaces."
    );
    expect(hookSecretError("a".repeat(513))).toBe("The hook secret can be at most 512 characters.");
  });

  it("accepts 32 printable characters, braces included", () => {
    expect(hookSecretError("!~{}abcdefghijklmnopqrstuvwxyz01")).toBeNull();
  });
});

describe("hookFormSchema", () => {
  it("accepts a hook with no rules", () => {
    expect(issuesOf(form())).toEqual([]);
  });

  it("checks the secret unless the saved one is kept", () => {
    expect(issuesOf(form({ secret: "" }))).toEqual([
      { path: "secret", message: "Enter a secret for the hook." }
    ]);
    expect(issuesOf(form({ secret: UNCHANGED_SECRET }))).toEqual([]);
  });

  it("asks for a name in words a person reads", () => {
    expect(issuesOf(form({ name: "" }))).toEqual([
      { path: "name", message: "Enter a name for the hook." }
    ]);
  });

  it("asks for a service on every rule", () => {
    expect(issuesOf(form({ rules: [blankHookRule()] }))).toEqual([
      { path: "rules.0.service", message: "Pick or type the service this rule applies to." }
    ]);
  });

  it("asks for a method when every one is cleared", () => {
    const rule = { ...blankHookRule(), service: "github", serviceType: AgentVaultServiceType.Http };
    expect(issuesOf(form({ rules: [{ ...rule, methods: [] }] }))).toEqual([
      { path: "rules.0.methods", message: "Pick at least one method." }
    ]);
  });

  it("flags a path or tool typed but not added", () => {
    const http = { ...blankHookRule(), service: "github", serviceType: AgentVaultServiceType.Http };
    const mcp = { ...blankHookRule(), service: "linear", serviceType: AgentVaultServiceType.Mcp };
    expect(issuesOf(form({ rules: [{ ...http, pathDraft: "/repos" }] }))).toEqual([
      { path: "rules.0.paths", message: 'Add "/repos" or clear it.' }
    ]);
    expect(issuesOf(form({ rules: [{ ...mcp, toolDraft: "delete issue" }] }))[0].path).toBe(
      "rules.0.tools"
    );
  });

  it("ignores the narrowing of a type the rule isn't for", () => {
    const rule = {
      ...blankHookRule(),
      service: "orders-db",
      serviceType: AgentVaultServiceType.Postgres,
      methods: [],
      pathDraft: "not a path"
    };
    expect(issuesOf(form({ rules: [rule] }))).toEqual([]);
  });
});

describe("buildHookRule", () => {
  it("sends methods and paths for an HTTP service, leaving out every method and empty lists", () => {
    const rule = {
      ...blankHookRule(),
      service: " github ",
      serviceType: AgentVaultServiceType.Http
    };
    expect(buildHookRule(rule)).toEqual({ service: "github" });
    expect(
      buildHookRule({ ...rule, methods: [AgentVaultHttpMethod.Put], paths: ["/repos"] })
    ).toEqual({ service: "github", methods: [AgentVaultHttpMethod.Put], paths: ["/repos"] });
  });

  it("sends tools for an MCP service and nothing else", () => {
    const rule = {
      ...blankHookRule(),
      service: "linear",
      serviceType: AgentVaultServiceType.Mcp,
      methods: [AgentVaultHttpMethod.Get],
      tools: ["delete_issue"]
    };
    expect(buildHookRule(rule)).toEqual({ service: "linear", tools: ["delete_issue"] });
  });

  it("sends the service alone for a database, SSH or unknown service", () => {
    const rule = { ...blankHookRule(), service: "orders-db", paths: ["/x"], tools: ["y"] };
    expect(buildHookRule({ ...rule, serviceType: AgentVaultServiceType.Ssh })).toEqual({
      service: "orders-db"
    });
    expect(buildHookRule(rule)).toEqual({ service: "orders-db" });
  });
});

describe("hookRuleDraftOf", () => {
  it("takes the type from the saved narrowing over the named service's", () => {
    expect(
      hookRuleDraftOf({ service: "x", tools: ["a"] }, AgentVaultServiceType.Http).serviceType
    ).toBe(AgentVaultServiceType.Mcp);
    expect(hookRuleDraftOf({ service: "x", paths: ["/a"] }).serviceType).toBe(
      AgentVaultServiceType.Http
    );
    expect(hookRuleDraftOf({ service: "x" }, AgentVaultServiceType.Mcp).serviceType).toBe(
      AgentVaultServiceType.Mcp
    );
    expect(hookRuleDraftOf({ service: "x" }).serviceType).toBeNull();
  });

  it("round-trips a saved rule", () => {
    const rule = { service: "github", methods: [AgentVaultHttpMethod.Put], paths: ["/repos"] };
    expect(buildHookRule(hookRuleDraftOf(rule))).toEqual(rule);
  });
});

describe("hook requests", () => {
  it("creates with the trimmed URL, the secret as typed and no blank description", () => {
    expect(buildCreateHookRequest(form({ url: ` ${HOOK_URL} ` }))).toEqual({
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET,
      rules: []
    });
  });

  it("sends nothing an edit didn't change", () => {
    const untouched = { ...hookFormOf(storedHook) };
    expect(untouched.secret).toBe(UNCHANGED_SECRET);
    expect(buildUpdateHookRequest(storedHook, untouched)).toEqual({});
  });

  it("prefills the name of a new hook", () => {
    expect(hookFormOf(null, new Map(), "release-guard").name).toBe("release-guard");
  });

  it("sends only the changed fields, and null to remove a description", () => {
    const described = { ...storedHook, description: "Asks on-call" };
    expect(
      buildUpdateHookRequest(described, { ...hookFormOf(described), name: "gate", description: "" })
    ).toEqual({ name: "gate", description: null });
    expect(
      buildUpdateHookRequest(storedHook, { ...hookFormOf(storedHook), secret: SECRET })
    ).toEqual({ secret: SECRET });
    expect(buildUpdateHookRequest(storedHook, { ...hookFormOf(storedHook), rules: [] })).toEqual({
      rules: []
    });
  });
});

describe("describeHookRule", () => {
  it("summarizes a rule on one line", () => {
    expect(describeHookRule({ service: "github" })).toBe("github");
    expect(
      describeHookRule({
        service: "github",
        methods: [AgentVaultHttpMethod.Put],
        paths: ["/repos"]
      })
    ).toBe("github: PUT on /repos");
    expect(describeHookRule({ service: "linear", tools: ["a", "b"] })).toBe("linear: 2 tools");
  });
});
