import https from "node:https";
import type { AddressInfo } from "node:net";

import forge from "node-forge";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { agentVaultOauthHttpClient } from "./agent-vault-oauth-http-fns";
import { exchangeAuthorizationCode, refreshAccessToken } from "./agent-vault-oauth-token-fns";
import { AgentVaultOauthClientAuthMethod } from "./agent-vault-oauth-types";

const { transportTrust } = vi.hoisted(() => ({ transportTrust: { ca: "", allowInternalIps: true } }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    isDevelopmentMode: false,
    ALLOW_INTERNAL_IP_CONNECTIONS: transportTrust.allowInternalIps,
    SAFE_REQUEST_FORCE_DIRECT_EGRESS: true
  })
}));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => undefined)
}));
vi.mock("@app/lib/logger", async () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));
vi.mock("@app/lib/logger/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// Trust only the test server's certificate; the library, OAuth transport and SSRF-safe dispatch stay real.
vi.mock("@app/lib/validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/validator")>();
  const post: typeof actual.safeRequest.post = (url, data, options) =>
    actual.safeRequest.post(url, data, { ...options, ca: transportTrust.ca });
  const get: typeof actual.safeRequest.get = (url, options) =>
    actual.safeRequest.get(url, { ...options, ca: transportTrust.ca });
  return { ...actual, safeRequest: { ...actual.safeRequest, post, get } };
});

const GOOGLE_CLIENT = { clientId: "123-abc.apps.googleusercontent.com", clientSecret: "GOCSPX-a_b.c" };
const RESERVED_CLIENT = { clientId: "id: one", clientSecret: "secret &two" };
const REGISTERED_CLIENTS = [GOOGLE_CLIENT, RESERVED_CLIENT];

// `/basic-decoded` form-decodes both halves of the Basic credentials as RFC 6749 section 2.3.1 asks;
// `/basic-literal` compares them as sent, the way Google does.
const isRegisteredBasicClient = (authorization: string | undefined, decode: boolean) => {
  const credentials = Buffer.from((authorization ?? "").replace(/^Basic /, ""), "base64").toString();
  const separator = credentials.indexOf(":");
  const read = (value: string) => (decode ? new URLSearchParams(`v=${value}`).get("v") : value);
  const clientId = read(credentials.slice(0, separator));
  const clientSecret = read(credentials.slice(separator + 1));
  return (
    separator !== -1 &&
    REGISTERED_CLIENTS.some((client) => client.clientId === clientId && client.clientSecret === clientSecret)
  );
};

describe("OAuth token requests over HTTPS", () => {
  let server: https.Server;
  let issuer: string;
  const requests: { method?: string; path: string; authorization?: string; form: URLSearchParams }[] = [];

  beforeAll(async () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = "01";
    certificate.validity.notBefore = new Date(Date.now() - 60_000);
    certificate.validity.notAfter = new Date(Date.now() + 60_000);
    certificate.setSubject([{ name: "commonName", value: "localhost" }]);
    certificate.setIssuer(certificate.subject.attributes);
    certificate.setExtensions([
      { name: "basicConstraints", cA: true },
      { name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }] }
    ]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    transportTrust.ca = forge.pki.certificateToPem(certificate);

    server = https.createServer(
      { key: forge.pki.privateKeyToPem(keys.privateKey), cert: transportTrust.ca },
      (request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("end", () => {
          const form = new URLSearchParams(body);
          requests.push({
            method: request.method,
            path: request.url ?? "",
            authorization: request.headers.authorization,
            form
          });
          if (request.url === "/sse" && request.method === "GET") {
            response.writeHead(401, { "WWW-Authenticate": `Bearer resource_metadata="${issuer}/meta"` });
            response.end();
          } else if (request.url === "/sse") {
            response.writeHead(405);
            response.end();
          } else if (request.url === "/redirect") {
            response.writeHead(302, { Location: `${issuer}/unexpected` });
            response.end();
          } else if (request.url === "/unavailable") {
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "temporarily_unavailable" }));
          } else if (request.url === "/trickle") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.write("{");
            const timer = setInterval(() => response.write(" "), 10);
            response.once("close", () => clearInterval(timer));
          } else if (request.url === "/basic-decoded" || request.url === "/basic-literal") {
            if (isRegisteredBasicClient(request.headers.authorization, request.url === "/basic-decoded")) {
              response.writeHead(200, { "Content-Type": "application/json" });
              response.end(JSON.stringify({ access_token: "at-basic", token_type: "Bearer" }));
            } else {
              response.writeHead(401, { "Content-Type": "application/json" });
              response.end(
                JSON.stringify({ error: "invalid_client", error_description: "The OAuth client was not found." })
              );
            }
          } else if (form.get("grant_type") === "authorization_code") {
            response.writeHead(200, { "Content-Type": "application/x-www-form-urlencoded" });
            response.end("access_token=at-code&token_type=bearer&refresh_token=rt-one&scope=repo%2Cgist");
          } else if (form.has("resource")) {
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "invalid_target" }));
          } else {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
              JSON.stringify({ access_token: "at-refreshed", token_type: "Bearer", refresh_token: "rt-two" })
            );
          }
        });
      }
    );
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    issuer = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30_000);

  beforeEach(() => {
    requests.length = 0;
    transportTrust.allowInternalIps = true;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  const args = () => ({
    http: agentVaultOauthHttpClient,
    issuer,
    tokenEndpoint: `${issuer}/token`,
    clientId: "id: one",
    resource: `${issuer}/mcp`,
    tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None
  });

  test("exchanges a code with Basic authentication and PKCE, accepting a form-encoded response", async () => {
    const result = await exchangeAuthorizationCode({
      ...args(),
      clientSecret: "secret &two",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic,
      code: "code-one",
      codeVerifier: "verifier-one",
      redirectUri: "https://infisical.test/agent-vault/oauth/callback",
      requestedScopes: ["repo", "gist"]
    });
    expect(result).toMatchObject({
      ok: true,
      tokens: { accessToken: "at-code", refreshToken: "rt-one", scopes: ["repo", "gist"], scopesCommaSeparated: true }
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].authorization).toBe(`Basic ${Buffer.from("id%3A+one:secret+%26two").toString("base64")}`);
    expect(Object.fromEntries(requests[0].form)).toEqual({
      grant_type: "authorization_code",
      code: "code-one",
      code_verifier: "verifier-one",
      redirect_uri: "https://infisical.test/agent-vault/oauth/callback",
      resource: `${issuer}/mcp`
    });
  });

  test("refreshes through the safe client and retries invalid_target once without resource", async () => {
    const result = await refreshAccessToken({ ...args(), refreshToken: "rt-one" });
    expect(result).toMatchObject({
      ok: true,
      resourceDropped: true,
      tokens: { accessToken: "at-refreshed", refreshToken: "rt-two" }
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].form.get("resource")).toBe(`${issuer}/mcp`);
    expect(requests[1].form.has("resource")).toBe(false);
    expect(requests[1].form.get("refresh_token")).toBe("rt-one");
    expect(requests[1].form.get("client_id")).toBe("id: one");
  });

  test.each([
    { path: "/basic-decoded", client: GOOGLE_CLIENT },
    { path: "/basic-decoded", client: RESERVED_CLIENT },
    { path: "/basic-literal", client: GOOGLE_CLIENT }
  ])("client_secret_basic works for $client.clientId at $path", async ({ path, client }) => {
    const basicArgs = {
      ...args(),
      ...client,
      tokenEndpoint: `${issuer}${path}`,
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
    };
    const exchanged = await exchangeAuthorizationCode({
      ...basicArgs,
      code: "code-one",
      codeVerifier: "verifier-one",
      redirectUri: "https://infisical.test/agent-vault/oauth/callback"
    });
    const refreshed = await refreshAccessToken({ ...basicArgs, refreshToken: "rt-one" });
    expect(exchanged).toMatchObject({ ok: true, tokens: { accessToken: "at-basic" } });
    expect(refreshed).toMatchObject({ ok: true, tokens: { accessToken: "at-basic" } });
    requests.forEach(({ authorization }) =>
      expect(Buffer.from(authorization!.replace(/^Basic /, ""), "base64").toString()).not.toMatch(/%2[DE]/i)
    );
  });

  test("never follows a redirect carrying a refresh token", async () => {
    const result = await refreshAccessToken({ ...args(), tokenEndpoint: `${issuer}/redirect`, refreshToken: "rt-one" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("HTTP 302");
    expect(requests.map(({ path }) => path)).toEqual(["/redirect"]);
  });

  test("never automatically retries a failed rotating refresh token request", async () => {
    const result = await refreshAccessToken({
      ...args(),
      tokenEndpoint: `${issuer}/unavailable`,
      refreshToken: "rt-one"
    });
    expect(result).toMatchObject({ ok: false, errorCode: "temporarily_unavailable" });
    expect(requests).toHaveLength(1);
  });

  test("the production SSRF check refuses a private token endpoint before sending any credentials", async () => {
    transportTrust.allowInternalIps = false;
    const result = await refreshAccessToken({ ...args(), refreshToken: "rt-one" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("because it's on a private network");
    expect(requests).toHaveLength(0);
  });

  test("the MCP probe falls back to GET when an SSE server refuses the POST without a challenge", async () => {
    const result = await agentVaultOauthHttpClient.probe(`${issuer}/sse`);
    expect(result).toEqual({ status: 401, wwwAuthenticate: `Bearer resource_metadata="${issuer}/meta"` });
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /sse", "GET /sse"]);
  });

  test("a provider trickling response bytes cannot extend the request deadline", async () => {
    const startedAt = Date.now();
    await expect(
      agentVaultOauthHttpClient.postForm(`${issuer}/trickle`, new URLSearchParams(), undefined, { timeoutMs: 100 })
    ).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
