import type { LookupAllOptions } from "node:dns";
import http from "node:http";

import { JwksClient } from "jwks-rsa";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectTimeAnswer,
  installConnectTimeDns,
  INTERNAL_IP,
  REBIND_HOST,
  startTargetPair,
  TTargetPair
} from "./dns-rebinding.test-utils";
import { buildSsrfSafeAgent, buildSsrfSafeJwksFetcher } from "./safe-request";

// JWT, machine-identity OIDC and OAuth token exchange auth fetch a JWKS from a URL an admin configures, through
// jwks-rsa. These tests open real sockets (see dns-rebinding.test-utils) and check which address the fetch reached.
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (hostname: string, options: LookupAllOptions) =>
    hostname === "rebind.invalid" || hostname.endsWith(".rebind.invalid")
      ? Promise.resolve([{ address: "127.0.0.1", family: 4 }])
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

// The axios client behind safeRequest imports the logger from here, not through @app/lib/logger
vi.mock("@app/lib/logger/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe("JWKS fetch from a URL the parsers read differently", () => {
  let restoreDns: () => void;
  let targets: TTargetPair;

  // To the WHATWG parser this host is 127.0.0.2a.rebind.invalid; the legacy url.parse reads it as 127.0.0.2
  const jwksUri = () => `http://127.0.0.2%61.${REBIND_HOST}:${targets.port}/jwks`;

  beforeAll(async () => {
    restoreDns = installConnectTimeDns();
    targets = await startTargetPair(() =>
      http.createServer((_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [] }));
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
    connectTimeAnswer.address = INTERNAL_IP;
  });

  it("control: jwks-rsa with an agent pinned to the checked host dials the IP the legacy parser reads", async () => {
    const client = new JwksClient({ jwksUri: jwksUri(), requestAgent: await buildSsrfSafeAgent(jwksUri()) });

    // The legacy parser also moves the port into the path, so the request dials the internal IP on port 80
    await expect(client.getSigningKeys()).rejects.toThrow(`connect ECONNREFUSED ${INTERNAL_IP}:80`);
    expect(targets.hits.public).toBe(0);
  });

  it("fetches only from the checked address when given the SSRF-safe fetcher", async () => {
    const client = new JwksClient({ jwksUri: jwksUri(), fetcher: await buildSsrfSafeJwksFetcher(jwksUri()) });

    // The test server publishes no keys, so reaching it ends in this error
    await expect(client.getSigningKeys()).rejects.toThrow("The JWKS endpoint did not contain any keys");
    expect(targets.hits).toEqual({ public: 1, internal: 0 });
  });

  it("refuses a JWKS URL whose checked host is internal when the fetcher is built", async () => {
    await expect(buildSsrfSafeJwksFetcher(`http://${INTERNAL_IP}:${targets.port}/jwks`)).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
    expect(targets.hits.internal).toBe(0);
  });

  it("uses the public address the check saw even when DNS later answers internal", async () => {
    connectTimeAnswer.address = INTERNAL_IP;
    const uri = `http://${REBIND_HOST}:${targets.port}/jwks`;
    const client = new JwksClient({ jwksUri: uri, fetcher: await buildSsrfSafeJwksFetcher(uri) });

    await expect(client.getSigningKeys()).rejects.toThrow("The JWKS endpoint did not contain any keys");
    expect(targets.hits).toEqual({ public: 1, internal: 0 });
  });
});
