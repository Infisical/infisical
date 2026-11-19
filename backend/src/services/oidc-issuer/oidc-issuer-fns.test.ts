import { createLocalJWKSet, jwtVerify } from "jose";

import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";

import { getKeyRotationPlan, getSigningKey, publicKeyToJwk, signJwt } from "./oidc-issuer-fns";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-10-27T12:00:00Z");
const keyCreatedHoursAgo = (id: string, hours: number) => ({
  id,
  createdAt: new Date(now.getTime() - hours * HOUR_MS)
});

describe("getKeyRotationPlan", () => {
  test("creates the current and next keys on the first sign", () => {
    expect(getKeyRotationPlan([], now)).toEqual({ keysToCreate: 2, keyIdsToDelete: [] });
    expect(getKeyRotationPlan([keyCreatedHoursAgo("a", 1)], now)).toEqual({ keysToCreate: 1, keyIdsToDelete: [] });
  });

  test("does nothing while the newest key is inside its signing period", () => {
    const keys = [keyCreatedHoursAgo("a", 47), keyCreatedHoursAgo("b", 23)];
    expect(getKeyRotationPlan(keys, now)).toEqual({ keysToCreate: 0, keyIdsToDelete: [] });
  });

  test("rotates once the newest key is a signing period old, keeping three keys", () => {
    expect(getKeyRotationPlan([keyCreatedHoursAgo("a", 48), keyCreatedHoursAgo("b", 24)], now)).toEqual({
      keysToCreate: 1,
      keyIdsToDelete: []
    });

    const keys = [keyCreatedHoursAgo("a", 72), keyCreatedHoursAgo("b", 48), keyCreatedHoursAgo("c", 24)];
    expect(getKeyRotationPlan(keys, now)).toEqual({ keysToCreate: 1, keyIdsToDelete: ["a"] });
  });

  test("signs with the second newest key", () => {
    const keys = [keyCreatedHoursAgo("a", 48), keyCreatedHoursAgo("b", 24), keyCreatedHoursAgo("c", 1)];
    expect(getSigningKey(keys)?.id).toBe("b");
    expect(getSigningKey(keys.slice(2))).toBeUndefined();
  });
});

describe("signJwt", () => {
  test("produces an RS256 token that verifies against the published JWK", async () => {
    const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey, sign } = signingService(
      AsymmetricKeyAlgorithm.RSA_4096
    );
    const privateKey = await generateAsymmetricPrivateKey();
    const jwk = await publicKeyToJwk(await getPublicKeyFromPrivateKey(privateKey));

    const iat = Math.floor(Date.now() / 1000);
    const token = await signJwt({
      kid: jwk.kid,
      claims: { iss: "https://issuer.test", sub: "app-connection:1", aud: "api://test", iat, exp: iat + 300 },
      sign: (data) => sign(data, privateKey, SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256, false)
    });

    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet({ keys: [jwk] }), {
      issuer: "https://issuer.test",
      audience: "api://test",
      algorithms: ["RS256"]
    });
    expect(protectedHeader).toEqual({ alg: "RS256", typ: "JWT", kid: jwk.kid });
    expect(payload.sub).toBe("app-connection:1");
  });
});
