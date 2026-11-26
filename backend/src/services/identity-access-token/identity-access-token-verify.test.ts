import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto";

import { AuthTokenType } from "../auth/auth-type";
import { verifyAccessTokenJwt } from "./identity-access-token-fns";

const AUTH_SECRET = "test-auth-secret";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    AUTH_SECRET
  })
}));

const payload = {
  identityId: "identity-id",
  identityAccessTokenId: "token-id",
  authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
};

describe("verifyAccessTokenJwt algorithm pinning", () => {
  let previousFipsEnabled: string | undefined;

  beforeAll(async () => {
    previousFipsEnabled = process.env.FIPS_ENABLED;
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize(async () => null);
  });

  afterAll(() => {
    if (previousFipsEnabled === undefined) {
      delete process.env.FIPS_ENABLED;
    } else {
      process.env.FIPS_ENABLED = previousFipsEnabled;
    }
  });

  test("accepts a token signed with HS256 (the algorithm signIdentityAccessToken uses)", () => {
    const token = jwt.sign(payload, AUTH_SECRET, { algorithm: "HS256", expiresIn: 60 });

    expect(verifyAccessTokenJwt(token)).toMatchObject(payload);
  });

  test.each(["HS384", "HS512"] as const)("rejects a token signed with %s using the same secret", (algorithm) => {
    const token = jwt.sign(payload, AUTH_SECRET, { algorithm, expiresIn: 60 });

    expect(() => verifyAccessTokenJwt(token)).toThrow("invalid algorithm");
  });
});
