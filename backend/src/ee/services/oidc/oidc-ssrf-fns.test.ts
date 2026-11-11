import type { LookupAllOptions } from "node:dns";
import http from "node:http";

import { Issuer } from "openid-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectTimeAnswer,
  installConnectTimeDns,
  INTERNAL_IP,
  PUBLIC_IP,
  REBIND_HOST,
  startTargetPair,
  TTargetPair
} from "@app/lib/validator/dns-rebinding.test-utils";

import { createSsrfSafeOidcClient, secureOidcIssuer, SsrfSafeIssuer } from "./oidc-ssrf-fns";

// The OIDC login makes server-side requests to IdP endpoints an org admin configures: discovery, JWKS and the
// token exchange. Each test points them at a name whose DNS answer changes after validation (see
// dns-rebinding.test-utils) and checks which address the requests reached.
const { validationAnswer } = vi.hoisted(() => ({ validationAnswer: { address: "127.0.0.1" } }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (hostname: string, options: LookupAllOptions) =>
    hostname === "rebind.invalid"
      ? Promise.resolve([{ address: validationAnswer.address, family: 4 }])
      : actual.lookup(hostname, options);
  return { ...actual, lookup, default: { ...actual, lookup } };
});

// 127.0.0.1 plays the public address, so it has to pass the private-address check
vi.mock("@app/lib/ip/ipRange", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/ip/ipRange")>();
  return { ...actual, isPrivateIp: (ip: string) => ip !== "127.0.0.1" && actual.isPrivateIp(ip) };
});

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => undefined)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

// Claims that pass openid-client's checks, so validation gets as far as fetching the signing key
const unsignedIdToken = (issuer: string, audience: string) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", kid: "key" });
  const payload = base64url({ iss: issuer, aud: audience, sub: "user", iat: now, exp: now + 60 });
  return `${header}.${payload}.signature`;
};

describe("OIDC SSO requests under DNS rebinding", () => {
  let restoreDns: () => void;
  let targets: TTargetPair;
  // What the IdP's discovery document names as its token endpoint
  let discoveredTokenEndpoint = "";

  const idpBase = () => `http://${REBIND_HOST}:${targets.port}`;

  beforeAll(async () => {
    restoreDns = installConnectTimeDns();
    targets = await startTargetPair(() =>
      http.createServer((req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.url?.includes("/.well-known/openid-configuration")) {
          res.end(
            JSON.stringify({
              issuer: idpBase(),
              authorization_endpoint: `${idpBase()}/authorize`,
              jwks_uri: `${idpBase()}/jwks`,
              token_endpoint: discoveredTokenEndpoint || `${idpBase()}/token`
            })
          );
          return;
        }
        if (req.url === "/jwks") {
          res.end(JSON.stringify({ keys: [] }));
          return;
        }
        res.end(JSON.stringify({ access_token: "token", token_type: "Bearer" }));
      })
    );
  });

  afterAll(async () => {
    restoreDns();
    await targets.close();
  });

  beforeEach(() => {
    targets.hits.public = 0;
    targets.hits.internal = 0;
    validationAnswer.address = PUBLIC_IP;
    connectTimeAnswer.address = INTERNAL_IP;
    discoveredTokenEndpoint = "";
  });

  const discoverFromPublicAnswer = async () => {
    connectTimeAnswer.address = PUBLIC_IP;
    const issuer = await SsrfSafeIssuer.discover(idpBase());
    targets.hits.public = 0;
    return issuer;
  };

  it("control: openid-client without the hook follows the connect-time answer to the internal address", async () => {
    await Issuer.discover(idpBase());

    expect(targets.hits).toEqual({ public: 0, internal: 1 });
  });

  it("refuses the discovery request when the connect-time answer is internal", async () => {
    await expect(SsrfSafeIssuer.discover(idpBase())).rejects.toThrow("Local IPs not allowed as URL");

    expect(targets.hits).toEqual({ public: 0, internal: 0 });
  });

  it("refuses the JWKS fetch when DNS changes after discovery", async () => {
    const issuer = await discoverFromPublicAnswer();
    await secureOidcIssuer(issuer);
    const client = createSsrfSafeOidcClient(issuer, { client_id: "id", client_secret: "secret" });
    connectTimeAnswer.address = INTERNAL_IP;

    // Verifying an RS256 ID token makes openid-client fetch the issuer's JWKS to find the signing key. callback()
    // does this during login; validateIdToken is the step it calls, though the type definitions omit it.
    const { validateIdToken } = client as unknown as { validateIdToken: (idToken: string) => Promise<unknown> };
    await expect(validateIdToken.call(client, unsignedIdToken(idpBase(), "id"))).rejects.toThrow(
      "Local IPs not allowed as URL"
    );

    expect(targets.hits.internal).toBe(0);
  });

  it("refuses the token exchange when DNS changes after the config was checked", async () => {
    const issuer = await discoverFromPublicAnswer();
    await secureOidcIssuer(issuer);
    const client = createSsrfSafeOidcClient(issuer, { client_id: "id", client_secret: "secret" });
    connectTimeAnswer.address = INTERNAL_IP;

    await expect(client.grant({ grant_type: "client_credentials" })).rejects.toThrow("Local IPs not allowed as URL");

    expect(targets.hits.internal).toBe(0);
  });

  it("still completes the token exchange when DNS keeps answering the public address", async () => {
    const issuer = await discoverFromPublicAnswer();
    await secureOidcIssuer(issuer);
    const client = createSsrfSafeOidcClient(issuer, { client_id: "id", client_secret: "secret" });

    const tokenSet = await client.grant({ grant_type: "client_credentials" });

    expect(tokenSet.access_token).toBe("token");
    expect(targets.hits).toEqual({ public: 1, internal: 0 });
  });

  it("refuses a discovery document that names an internal IP as an endpoint", async () => {
    discoveredTokenEndpoint = `http://${INTERNAL_IP}:${targets.port}/token`;
    const issuer = await discoverFromPublicAnswer();

    await expect(secureOidcIssuer(issuer)).rejects.toThrow("Local IPs not allowed as URL");
  });

  it("control: without the endpoint check, a discovered internal IP endpoint is called", async () => {
    discoveredTokenEndpoint = `http://${INTERNAL_IP}:${targets.port}/token`;
    const issuer = await discoverFromPublicAnswer();
    const client = new issuer.Client({ client_id: "id", client_secret: "secret" });

    await client.grant({ grant_type: "client_credentials" });

    expect(targets.hits.internal).toBe(1);
  });
});
