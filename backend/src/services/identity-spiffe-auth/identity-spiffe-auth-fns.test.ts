import { createLocalJWKSet, exportJWK, generateKeyPair, JWK, jwtVerify, SignJWT } from "jose";
import { beforeAll, describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { parseSpiffeBundleJwtAuthorities } from "./identity-spiffe-auth-fns";

describe("parseSpiffeBundleJwtAuthorities", () => {
  let jwtSigningKey: JWK;
  let signedJwtSvid: string;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    jwtSigningKey = { ...(await exportJWK(publicKey)), kid: "jwt-authority-1" };
    signedJwtSvid = await new SignJWT({ sub: "spiffe://example.org/workload" })
      .setProtectedHeader({ alg: "ES256", kid: "jwt-authority-1" })
      .setAudience("infisical")
      .setExpirationTime("5m")
      .sign(privateKey);
  });

  const spireBundle = () =>
    JSON.stringify({
      keys: [
        { use: "x509-svid", kty: "EC", crv: "P-256", x: jwtSigningKey.x, y: jwtSigningKey.y, x5c: ["MIIB"] },
        { ...jwtSigningKey, use: "jwt-svid" }
      ],
      spiffe_sequence: 1,
      spiffe_refresh_hint: 300
    });

  test("verifies a JWT-SVID against the native SPIFFE bundle format", async () => {
    const jwks = parseSpiffeBundleJwtAuthorities(spireBundle());

    expect(jwks).toEqual({ keys: [{ ...jwtSigningKey, use: "sig" }] });
    const { payload } = await jwtVerify(signedJwtSvid, createLocalJWKSet(jwks), { audience: "infisical" });
    expect(payload.sub).toBe("spiffe://example.org/workload");
  });

  test.each([
    ["use: sig", { use: "sig" }],
    ["no use", {}]
  ])("keeps keys from a plain RFC 7517 JWKS (%s)", async (_, extra) => {
    const jwks = parseSpiffeBundleJwtAuthorities(JSON.stringify({ keys: [{ ...jwtSigningKey, ...extra }] }));

    await expect(jwtVerify(signedJwtSvid, createLocalJWKSet(jwks), { audience: "infisical" })).resolves.toBeDefined();
  });

  test("drops keys for other SVID types", () => {
    const jwks = parseSpiffeBundleJwtAuthorities(
      JSON.stringify({
        keys: [
          { ...jwtSigningKey, use: "wit-svid", kid: "wit" },
          { ...jwtSigningKey, use: "jwt-svid" }
        ]
      })
    );

    expect(jwks.keys.map((key) => key.kid)).toEqual(["jwt-authority-1"]);
  });

  test.each([
    ["invalid JSON", "{not json"],
    ["no keys array", JSON.stringify({ spiffe_sequence: 1 })],
    ["null", "null"],
    ["only X.509 authorities", JSON.stringify({ keys: [{ use: "x509-svid", kty: "EC", x5c: ["MIIB"] }] })]
  ])("rejects a bundle with %s", (_, bundle) => {
    expect(() => parseSpiffeBundleJwtAuthorities(bundle)).toThrow(BadRequestError);
  });
});
