import { describe, expect, test, vi } from "vitest";

import {
  manualOauthClient,
  MAX_CLIENT_ID_LENGTH,
  OauthRegistrationError,
  registerOauthClient
} from "./agent-vault-oauth-client-fns";
import { TOauthHttpClient, TOauthHttpResponse } from "./agent-vault-oauth-http-fns";
import { AgentVaultOauthClientAuthMethod, AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

const stubPosts = (responses: TOauthHttpResponse[]) => {
  const calls: { url: string; json: unknown }[] = [];
  const http: TOauthHttpClient = {
    probe: async () => ({ status: 401, wwwAuthenticate: null }),
    get: async () => {
      throw new Error("unexpected");
    },
    postForm: async () => {
      throw new Error("unexpected");
    },
    postJson: async (url, json) => {
      calls.push({ url, json });
      const response = responses.shift();
      if (!response) throw new Error("no more stubbed responses");
      return response;
    }
  };
  return { http, calls };
};

const json = (status: number, body: unknown): TOauthHttpResponse => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body)
});

describe("client registration", () => {
  const args = {
    serverUrl: "https://mcp.example.com/mcp",
    registrationEndpoint: "https://mcp.example.com/register",
    redirectUri: "https://app.infisical.com/agent-vault/oauth/callback",
    grantTypesSupported: null,
    tokenEndpointAuthMethodsSupported: null
  };

  test("sends the full metadata and keeps the method the server assigned", async () => {
    const { http, calls } = stubPosts([
      json(201, { client_id: "c-1", client_secret: "s-1", token_endpoint_auth_method: "client_secret_post" })
    ]);
    expect(await registerOauthClient({ http, ...args })).toEqual({
      client: {
        clientId: "c-1",
        clientSecret: "s-1",
        tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost
      },
      compatibility: []
    });
    expect(calls[0].json).toEqual({
      client_name: "Infisical Agent Vault",
      redirect_uris: [args.redirectUri],
      token_endpoint_auth_method: "none",
      application_type: "web",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
  });

  test("asks for refresh_token only when the server doesn't list grants without it", async () => {
    const { http, calls } = stubPosts([json(201, { client_id: "c-1" })]);
    await registerOauthClient({ http, ...args, grantTypesSupported: ["authorization_code"] });
    expect(calls[0].json).toMatchObject({ grant_types: ["authorization_code"] });
  });

  test("asks for a confidential client when the server lists its auth methods without none", async () => {
    const { http, calls } = stubPosts([json(201, { client_id: "c-3", client_secret: "s-3" })]);
    const result = await registerOauthClient({
      http,
      ...args,
      tokenEndpointAuthMethodsSupported: ["client_secret_post"]
    });
    expect(calls[0].json).toMatchObject({ token_endpoint_auth_method: "client_secret_post" });
    expect(result.client).toEqual({
      clientId: "c-3",
      clientSecret: "s-3",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost
    });

    const both = stubPosts([json(201, { client_id: "c-4" })]);
    await registerOauthClient({
      http: both.http,
      ...args,
      tokenEndpointAuthMethodsSupported: ["client_secret_basic", "none"]
    });
    expect(both.calls[0].json).toMatchObject({ token_endpoint_auth_method: "none" });
  });

  test("a rejected registration is retried once without application_type, keeping the grant types", async () => {
    const { http, calls } = stubPosts([
      json(400, { error: "invalid_client_metadata" }),
      json(201, { client_id: "c-2" })
    ]);
    const result = await registerOauthClient({ http, ...args });
    expect(result.client).toEqual({ clientId: "c-2", tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None });
    expect(result.compatibility).toEqual([AgentVaultOauthCompatibility.RegistrationMinimal]);
    expect(calls[1].json).toEqual({
      client_name: "Infisical Agent Vault",
      redirect_uris: [args.redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
  });

  test("two refusals, or a server error, end in a registration error", async () => {
    const refused = stubPosts([json(400, {}), json(403, {})]);
    await expect(registerOauthClient({ http: refused.http, ...args })).rejects.toBeInstanceOf(OauthRegistrationError);

    const broken = stubPosts([json(503, {})]);
    await expect(registerOauthClient({ http: broken.http, ...args })).rejects.toThrow(/HTTP 503/);
    expect(broken.calls).toHaveLength(1);
  });

  test("the server's reason for refusing is passed on", async () => {
    const { http } = stubPosts([
      json(400, { error: "invalid_redirect_uri", error_description: "Plaintext HTTP is allowed only for loopback." }),
      json(400, { error: "invalid_redirect_uri", error_description: "Plaintext HTTP is allowed only for loopback." })
    ]);
    await expect(registerOauthClient({ http, ...args })).rejects.toThrow(
      "its registration endpoint refused to register Infisical as a client (Plaintext HTTP is allowed only for loopback.)."
    );
  });

  test("a long JWT client ID is accepted, up to the limit", async () => {
    const jwtLength = stubPosts([json(201, { client_id: "c".repeat(850) })]);
    expect((await registerOauthClient({ http: jwtLength.http, ...args })).client.clientId).toHaveLength(850);

    const tooLong = stubPosts([json(201, { client_id: "c".repeat(MAX_CLIENT_ID_LENGTH + 1) })]);
    await expect(registerOauthClient({ http: tooLong.http, ...args })).rejects.toThrow(/no usable client ID/);
  });

  test("a client ID or secret that isn't printable ASCII is no usable client", async () => {
    const badId = stubPosts([json(201, { client_id: "c\u0000" })]);
    await expect(registerOauthClient({ http: badId.http, ...args })).rejects.toThrow(/no usable client ID/);

    const badSecret = stubPosts([json(201, { client_id: "c", client_secret: "s\ud800" })]);
    await expect(registerOauthClient({ http: badSecret.http, ...args })).rejects.toThrow(/no usable client ID/);
  });

  test("the refusal reason is normalized, the error code included", async () => {
    const { http } = stubPosts([json(400, { error: "bad\u0000request" }), json(400, { error: "bad\u0000request" })]);
    await expect(registerOauthClient({ http, ...args })).rejects.toThrow(
      "its registration endpoint refused to register Infisical as a client (bad request)."
    );
  });

  test("a manual client picks basic unless the server lists only post", () => {
    expect(manualOauthClient({ clientId: "c", tokenEndpointAuthMethodsSupported: null })).toEqual({
      clientId: "c",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None
    });
    expect(
      manualOauthClient({ clientId: "c", clientSecret: "s", tokenEndpointAuthMethodsSupported: null })
        .tokenEndpointAuthMethod
    ).toBe(AgentVaultOauthClientAuthMethod.ClientSecretBasic);
    expect(
      manualOauthClient({
        clientId: "c",
        clientSecret: "s",
        tokenEndpointAuthMethodsSupported: ["client_secret_post"]
      }).tokenEndpointAuthMethod
    ).toBe(AgentVaultOauthClientAuthMethod.ClientSecretPost);
  });
});
