import http from "node:http";
import type { AddressInfo } from "node:net";

import dns from "node:dns/promises";
import { Client, Issuer, IssuerMetadata, Strategy } from "openid-client";
import { beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";

import { oidcConfigServiceFactory } from "./oidc-config-service";
import { OIDCConfigurationType } from "./oidc-config-types";

const config = vi.hoisted(() => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => config }));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// literal IPs keep the suite hermetic: the address checks skip the DNS lookup
const publicMetadata: IssuerMetadata = {
  issuer: "https://8.8.8.8",
  jwks_uri: "https://8.8.8.8/jwks",
  token_endpoint: "https://8.8.8.8/token"
};

const getOrgAuthStrategy = (issuer: Issuer) => {
  vi.spyOn(Issuer, "discover").mockResolvedValue(issuer);

  return oidcConfigServiceFactory({
    orgDAL: { findOne: vi.fn().mockResolvedValue({ id: "org-id" }) },
    oidcConfigDAL: {
      findOne: vi.fn().mockResolvedValue({
        isActive: true,
        configurationType: OIDCConfigurationType.DISCOVERY_URL,
        discoveryURL: "https://8.8.8.8/.well-known/openid-configuration",
        encryptedOidcClientId: Buffer.from("client-id"),
        encryptedOidcClientSecret: Buffer.from("client-secret")
      })
    },
    kmsService: {
      createCipherPairWithDataKey: vi
        .fn()
        .mockResolvedValue({ decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob })
    }
  } as unknown as Parameters<typeof oidcConfigServiceFactory>[0]).getOrgAuthStrategy("org-slug", "orgSlug");
};

describe("getOrgAuthStrategy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.ALLOW_INTERNAL_IP_CONNECTIONS = false;
  });

  test.each(["jwks_uri", "token_endpoint"])("refuses a discovered %s on a private address", async (endpoint) => {
    await expect(
      getOrgAuthStrategy(new Issuer({ ...publicMetadata, [endpoint]: "https://10.0.0.1/path" }))
    ).rejects.toThrow("Local IPs not allowed as URL");
  });

  test.each(["https://8.8.8.8/jwks", "https://[2606:4700:4700::1111]/jwks"])(
    "returns a login strategy for a discovered JWKS at %s",
    async (jwksUri) => {
      await expect(getOrgAuthStrategy(new Issuer({ ...publicMetadata, jwks_uri: jwksUri }))).resolves.toBeInstanceOf(
        Strategy
      );
    }
  );

  test("sends the JWKS and token requests to the address that passed the check", async () => {
    // Setup: idp.invalid resolves only for the check, so the server is reachable only at the checked address
    config.ALLOW_INTERNAL_IP_CONNECTIONS = true;
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? "");
      res.end(JSON.stringify({ keys: [], access_token: "token", token_type: "Bearer" }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    onTestFinished(() => {
      server.closeAllConnections();
      server.close();
    });
    const origin = `http://idp.invalid:${(server.address() as AddressInfo).port}`;
    const issuer = new Issuer({ ...publicMetadata, jwks_uri: `${origin}/jwks`, token_endpoint: `${origin}/token` });

    // Action
    const { _client: client } = (await getOrgAuthStrategy(issuer)) as unknown as { _client: Client };
    await (issuer as unknown as { reloadJwksUri: () => Promise<void> }).reloadJwksUri();
    await client.grant({ grant_type: "client_credentials" });

    // Assert
    expect(requestedPaths).toEqual(["/jwks", "/token"]);
  });
});
