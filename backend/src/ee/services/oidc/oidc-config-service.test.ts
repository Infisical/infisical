import { Issuer, IssuerMetadata, Strategy } from "openid-client";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { oidcConfigServiceFactory } from "./oidc-config-service";
import { OIDCConfigurationType } from "./oidc-config-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    isDevelopmentMode: false,
    ALLOW_INTERNAL_IP_CONNECTIONS: false
  })
}));

// literal IPs keep the suite hermetic: blockLocalAndPrivateIpAddresses skips the DNS lookup
const publicMetadata: IssuerMetadata = {
  issuer: "https://8.8.8.8",
  jwks_uri: "https://8.8.8.8/jwks",
  token_endpoint: "https://8.8.8.8/token"
};

const getOrgAuthStrategy = (metadata: IssuerMetadata) => {
  vi.spyOn(Issuer, "discover").mockResolvedValue(new Issuer(metadata));

  return oidcConfigServiceFactory({
    orgDAL: { findOne: vi.fn().mockResolvedValue({ id: "org-id" }) },
    oidcConfigDAL: {
      findOne: vi.fn().mockResolvedValue({
        isActive: true,
        configurationType: OIDCConfigurationType.DISCOVERY_URL,
        discoveryURL: "https://8.8.8.8/.well-known/openid-configuration",
        encryptedOidcClientId: Buffer.from("client-id")
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
  beforeEach(() => vi.restoreAllMocks());

  test.each(["jwks_uri", "token_endpoint"])("refuses a discovered %s on a private address", async (endpoint) => {
    await expect(getOrgAuthStrategy({ ...publicMetadata, [endpoint]: "https://10.0.0.1/path" })).rejects.toThrow(
      "Local IPs not allowed as URL"
    );
  });

  test("returns a login strategy when the discovered endpoints are public", async () => {
    await expect(getOrgAuthStrategy(publicMetadata)).resolves.toBeInstanceOf(Strategy);
  });
});
