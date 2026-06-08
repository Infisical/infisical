import crypto from "node:crypto";

import { computePkceChallenge, isRegisteredRedirectUri, parseBasicAuthHeader } from "./oauth-client-fns";

describe("parseBasicAuthHeader", () => {
  test("parses a valid Basic auth header", () => {
    const header = `Basic ${Buffer.from("my-client:my-secret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "my-client", clientSecret: "my-secret" });
  });

  test("decodes form-urlencoded credentials", () => {
    const header = `Basic ${Buffer.from("client%3Aid:se%2Fcret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "client:id", clientSecret: "se/cret" });
  });

  test("handles secrets containing colons", () => {
    const header = `Basic ${Buffer.from("client:sec:ret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "client", clientSecret: "sec:ret" });
  });

  test("returns null for missing header", () => {
    expect(parseBasicAuthHeader(undefined)).toBeNull();
  });

  test("returns null for Bearer header", () => {
    expect(parseBasicAuthHeader("Bearer some-jwt")).toBeNull();
  });

  test("returns null when credentials have no separator", () => {
    const header = `Basic ${Buffer.from("no-separator").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toBeNull();
  });
});

describe("computePkceChallenge", () => {
  test("computes the S256 challenge of a verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(computePkceChallenge(verifier)).toEqual(expected);
  });

  test("matches the RFC 7636 appendix B test vector", () => {
    expect(computePkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toEqual(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
});

describe("isRegisteredRedirectUri", () => {
  test("matches exact URI", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth/infisical/callback"],
        "https://coder.example.com/external-auth/infisical/callback"
      )
    ).toBe(true);
  });

  test("matches URL-normalized URI", () => {
    expect(isRegisteredRedirectUri(["https://coder.example.com"], "https://coder.example.com/")).toBe(true);
  });

  test("rejects unregistered URI", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth/infisical/callback"],
        "https://evil.example.com/callback"
      )
    ).toBe(false);
  });

  test("rejects URI with extra path segments", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth"],
        "https://coder.example.com/external-auth/other"
      )
    ).toBe(false);
  });
});
