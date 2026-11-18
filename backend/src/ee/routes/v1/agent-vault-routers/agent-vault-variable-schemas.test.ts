import { describe, expect, test } from "vitest";
import { z } from "zod";

import { AgentVaultVariableType } from "@app/ee/services/agent-vault/agent-vault-enums";

import {
  AgentVaultCreateVariableBodySchema,
  AgentVaultOauthVariableCompleteSchema,
  AgentVaultOauthVariableTokensSchema,
  AgentVaultUpdateVariableBodySchema
} from "./agent-vault-schemas";

const messagesOf = (schema: z.ZodTypeAny, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};

const manualOauth = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  clientId: "client-1",
  scopes: ["openid"]
};

describe("AgentVaultCreateVariableBodySchema", () => {
  test("a text variable is the default and still needs only a value", () => {
    const parsed = AgentVaultCreateVariableBodySchema.parse({ scope: "global", key: "GITHUB_TOKEN", value: "ghp_1" });

    expect(parsed.type).toBe(AgentVaultVariableType.Text);
  });

  test("an OAuth variable takes settings and no value", () => {
    expect(
      AgentVaultCreateVariableBodySchema.safeParse({ scope: "global", key: "G", type: "oauth", oauth: manualOauth })
        .success
    ).toBe(true);
    expect(messagesOf(AgentVaultCreateVariableBodySchema, { scope: "global", key: "G", type: "oauth" })).toEqual([
      "oauth: An OAuth variable needs its provider settings in 'oauth'."
    ]);
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, {
        scope: "global",
        key: "G",
        type: "oauth",
        value: "token",
        oauth: manualOauth
      })
    ).toEqual([expect.stringMatching(/^value: /)]);
  });

  test("refuses a personal OAuth variable", () => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, { scope: "personal", key: "G", type: "oauth", oauth: manualOauth })
    ).toEqual(["scope: OAuth variables can only be global. Create it with scope 'global'."]);
  });

  test("refuses OAuth settings on a text variable", () => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, { scope: "global", key: "G", value: "v", oauth: manualOauth })
    ).toEqual([expect.stringMatching(/^oauth: /)]);
  });

  test.each([
    ["http", "http://login.example.com/token"],
    ["a username", "https://user:pass@login.example.com/token"],
    ["a fragment", "https://login.example.com/token#x"],
    ["non-ASCII text", "https://login.exämple.com/token"]
  ])("refuses an endpoint with %s", (_name, tokenEndpoint) => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, {
        scope: "global",
        key: "G",
        type: "oauth",
        oauth: { ...manualOauth, tokenEndpoint }
      })
    ).toContain(
      "oauth.tokenEndpoint: 'tokenEndpoint' must be an https:// URL without a username, password or fragment, using only printable ASCII characters."
    );
  });

  test("refuses a scope that would split the scope parameter", () => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, {
        scope: "global",
        key: "G",
        type: "oauth",
        oauth: { ...manualOauth, scopes: ["read write"] }
      })
    ).toEqual([expect.stringMatching(/^oauth\.scopes\.0: /)]);
  });

  test("refuses endpoints set up by hand without a scope", () => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, {
        scope: "global",
        key: "G",
        type: "oauth",
        oauth: { ...manualOauth, scopes: [] }
      })
    ).toEqual([expect.stringMatching(/^oauth\.scopes: A provider set up by hand needs at least one scope/)]);
  });
});

describe("AgentVaultCreateVariableBodySchema, tokens and sign-in", () => {
  test("an OAuth variable takes tokens or a sign-in, not both", () => {
    const base = { scope: "global", key: "G", type: "oauth", oauth: manualOauth };
    expect(AgentVaultCreateVariableBodySchema.safeParse({ ...base, tokens: { accessToken: "a" } }).success).toBe(true);
    expect(AgentVaultCreateVariableBodySchema.safeParse({ ...base, signIn: {} }).success).toBe(true);
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, { ...base, tokens: { accessToken: "a" }, signIn: {} })
    ).toEqual(["signIn: Send either 'tokens' to import or 'signIn' to start a sign-in, not both."]);
  });

  test("a text variable takes neither", () => {
    expect(
      messagesOf(AgentVaultCreateVariableBodySchema, {
        scope: "global",
        key: "G",
        value: "v",
        tokens: { accessToken: "a" },
        signIn: {}
      })
    ).toEqual([
      "tokens: Only an OAuth variable takes tokens. Send type 'oauth'.",
      "signIn: Only an OAuth variable can be signed in to. Send type 'oauth'."
    ]);
  });
});

describe("AgentVaultUpdateVariableBodySchema", () => {
  test("takes tokens on their own, but not with value null", () => {
    expect(AgentVaultUpdateVariableBodySchema.safeParse({ tokens: { accessToken: "a" } }).success).toBe(true);
    expect(messagesOf(AgentVaultUpdateVariableBodySchema, { tokens: { accessToken: "a" }, value: null })).toEqual([
      "tokens: Send either 'tokens' to replace the variable's tokens or 'value' as null to disconnect it, not both."
    ]);
  });

  test("takes value null and OAuth settings to clear", () => {
    expect(AgentVaultUpdateVariableBodySchema.safeParse({ value: null }).success).toBe(true);
    expect(AgentVaultUpdateVariableBodySchema.safeParse({ oauth: { clientName: null } }).success).toBe(true);
  });

  test("refuses an empty update", () => {
    expect(AgentVaultUpdateVariableBodySchema.safeParse({}).success).toBe(false);
    expect(AgentVaultUpdateVariableBodySchema.safeParse({ oauth: {} }).success).toBe(false);
  });
});

describe("AgentVaultOauthVariableTokensSchema", () => {
  test("takes tokens as sent and refuses line breaks", () => {
    expect(
      AgentVaultOauthVariableTokensSchema.safeParse({ accessToken: "ya29.a0", refreshToken: "1//0g" }).success
    ).toBe(true);
    expect(AgentVaultOauthVariableTokensSchema.safeParse({ accessToken: "a\nb" }).success).toBe(false);
  });
});

describe("AgentVaultOauthVariableCompleteSchema", () => {
  test("takes a code or an error, not both or neither", () => {
    expect(AgentVaultOauthVariableCompleteSchema.safeParse({ state: "s", code: "c" }).success).toBe(true);
    expect(AgentVaultOauthVariableCompleteSchema.safeParse({ state: "s", error: "access_denied" }).success).toBe(true);
    expect(AgentVaultOauthVariableCompleteSchema.safeParse({ state: "s" }).success).toBe(false);
    expect(AgentVaultOauthVariableCompleteSchema.safeParse({ state: "s", code: "c", error: "e" }).success).toBe(false);
  });
});
