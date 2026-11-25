import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentVaultHttpMethod, AgentVaultServiceType } from "@app/hooks/api/agentVault";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { UNCHANGED_SECRET } from "../service-sheet/serviceSchema";
import {
  addHookNarrowingIssues,
  blankHookNarrowing,
  buildCreateHookRequest,
  buildHookNarrowing,
  buildUpdateHookRequest,
  describeHookNarrowing,
  hookFormOf,
  hookFormSchema,
  hookNarrowingDraftOf,
  hookSecretError,
  hookUrlError,
  listNames,
  sameHookNarrowing,
  THookForm,
  THookNarrowingDraft
} from "./hookSchema";

const HOOK_URL = "https://hooks.example.com/agent-vault";
const SECRET = "s".repeat(32);

const storedHook: TAgentVaultHook = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  name: "approvals",
  description: null,
  url: HOOK_URL,
  usedBy: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "github",
      type: AgentVaultServiceType.Http,
      hostPattern: "api.github.com"
    }
  ],
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z"
};

const form = (overrides: Partial<THookForm> = {}): THookForm => ({
  name: "approvals",
  description: "",
  url: HOOK_URL,
  secret: SECRET,
  ...overrides
});

const narrowingIssuesOf = (draft: THookNarrowingDraft, serviceType: AgentVaultServiceType) => {
  const result = z
    .custom<THookNarrowingDraft>()
    .superRefine((data, ctx) => addHookNarrowingIssues(data, serviceType, ctx))
    .safeParse(draft);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
};

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
  it("accepts a hook", () => {
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
});

describe("addHookNarrowingIssues", () => {
  it("asks for a method when every one is cleared", () => {
    expect(
      narrowingIssuesOf({ ...blankHookNarrowing(), methods: [] }, AgentVaultServiceType.Http)
    ).toEqual([{ path: "hook.methods", message: "Pick at least one method." }]);
  });

  it("flags a path or tool typed but not added", () => {
    expect(
      narrowingIssuesOf(
        { ...blankHookNarrowing(), pathDraft: "/repos" },
        AgentVaultServiceType.Http
      )
    ).toEqual([{ path: "hook.paths", message: 'Add "/repos" or clear it.' }]);
    expect(
      narrowingIssuesOf(
        { ...blankHookNarrowing(), toolDraft: "delete issue" },
        AgentVaultServiceType.Mcp
      )[0].path
    ).toBe("hook.tools");
  });

  it("caps each list", () => {
    const paths = Array.from({ length: 101 }, (_, index) => `/p${index}`);
    expect(
      narrowingIssuesOf({ ...blankHookNarrowing(), paths }, AgentVaultServiceType.Http)
    ).toEqual([{ path: "hook.paths", message: "A hook can check at most 100 path prefixes." }]);
  });

  it("ignores the narrowing of a type the service isn't", () => {
    expect(
      narrowingIssuesOf(
        { ...blankHookNarrowing(), methods: [], pathDraft: "not a path" },
        AgentVaultServiceType.Postgres
      )
    ).toEqual([]);
  });
});

describe("hook requests", () => {
  it("creates with the trimmed URL, the secret as typed and no blank description", () => {
    expect(buildCreateHookRequest(form({ url: ` ${HOOK_URL} ` }))).toEqual({
      name: "approvals",
      url: HOOK_URL,
      secret: SECRET
    });
  });

  it("sends nothing an edit didn't change", () => {
    const untouched = { ...hookFormOf(storedHook) };
    expect(untouched.secret).toBe(UNCHANGED_SECRET);
    expect(buildUpdateHookRequest(storedHook, untouched)).toEqual({});
  });

  it("prefills the name of a new hook", () => {
    expect(hookFormOf(null, "release-guard").name).toBe("release-guard");
  });

  it("sends only the changed fields, and null to remove a description", () => {
    const described = { ...storedHook, description: "Asks on-call" };
    expect(
      buildUpdateHookRequest(described, { ...hookFormOf(described), name: "gate", description: "" })
    ).toEqual({ name: "gate", description: null });
    expect(
      buildUpdateHookRequest(storedHook, { ...hookFormOf(storedHook), secret: SECRET })
    ).toEqual({ secret: SECRET });
    expect(
      buildUpdateHookRequest(storedHook, {
        ...hookFormOf(storedHook),
        url: ` https://hooks.example.com/v2 `
      })
    ).toEqual({ url: "https://hooks.example.com/v2" });
  });
});

describe("describeHookNarrowing", () => {
  it("summarizes a narrowing on one line, or null for everything", () => {
    expect(describeHookNarrowing({})).toBeNull();
    expect(describeHookNarrowing({ methods: [AgentVaultHttpMethod.Put], paths: ["/repos"] })).toBe(
      "PUT on /repos"
    );
    expect(describeHookNarrowing({ tools: ["a", "b"] })).toBe("2 tools");
  });
});

describe("listNames", () => {
  it("lists names as a sentence, naming at most three", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["stripe"])).toBe("stripe");
    expect(listNames(["stripe", "billing-api"])).toBe("stripe and billing-api");
    expect(listNames(["a", "b", "c"])).toBe("a, b and c");
    expect(listNames(["a", "b", "c", "d"])).toBe("a, b, c and d");
    expect(listNames(["a", "b", "c", "d", "e"])).toBe("a, b, c and 2 more");
  });
});

describe("hook narrowing", () => {
  it("compares lists as sets", () => {
    expect(
      sameHookNarrowing(
        { methods: [AgentVaultHttpMethod.Get, AgentVaultHttpMethod.Put] },
        { methods: [AgentVaultHttpMethod.Put, AgentVaultHttpMethod.Get] }
      )
    ).toBe(true);
    expect(sameHookNarrowing({ tools: ["a"] }, {})).toBe(false);
  });

  it("builds only what the service's type uses", () => {
    const draft = { ...blankHookNarrowing(), paths: ["/a"], tools: ["t"] };
    expect(buildHookNarrowing(draft, AgentVaultServiceType.Http)).toEqual({ paths: ["/a"] });
    expect(buildHookNarrowing(draft, AgentVaultServiceType.Mcp)).toEqual({ tools: ["t"] });
    expect(buildHookNarrowing(draft, AgentVaultServiceType.Postgres)).toEqual({});
  });

  it("leaves out every method and empty lists", () => {
    expect(buildHookNarrowing(blankHookNarrowing(), AgentVaultServiceType.Http)).toEqual({});
  });

  it("round-trips a saved narrowing", () => {
    const narrowing = { methods: [AgentVaultHttpMethod.Put], paths: ["/repos"] };
    expect(buildHookNarrowing(hookNarrowingDraftOf(narrowing), AgentVaultServiceType.Http)).toEqual(
      narrowing
    );
  });
});
