import nodeCrypto from "node:crypto";

import { importPKCS8, SignJWT } from "jose";
import jwt from "jsonwebtoken";

import { TOidcConfigs } from "@app/db/schemas";
import { OIDCConfigurationType, OIDCJWTSignatureAlgorithm } from "@app/ee/services/oidc/oidc-config-types";
import { crypto } from "@app/lib/crypto";

import { resolveOidcTrustAnchor, verifySubjectToken } from "./oauth-token-exchange-fns";

const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeyPair = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const ed25519KeyPair = nodeCrypto.generateKeyPairSync("ed25519");

const PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const OTHER_PRIVATE_KEY_PEM = otherKeyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ED25519_PUBLIC_KEY_PEM = ed25519KeyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
const ED25519_PRIVATE_KEY_PEM = ed25519KeyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const getSigningKey = vi.fn<(kid: string) => Promise<{ getPublicKey: () => string }>>();

vi.mock("jwks-rsa", () => ({
  JwksClient: class {
    getSigningKey = getSigningKey;
  }
}));

const safeGet = vi.fn<(url: string) => Promise<{ data: { jwks_uri?: string; issuer?: string } }>>();
const buildSsrfSafeAgent = vi.fn<(url: string) => Promise<undefined>>();
vi.mock("@app/lib/validator/safe-request", () => ({
  safeRequest: { get: (url: string) => safeGet(url) },
  buildSsrfSafeAgent: (url: string) => buildSsrfSafeAgent(url)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeUrlForLog: (url: string) => url
}));

const ISSUER = "https://adfs.example.com/adfs";
const AUDIENCE = "api://paychex-mcp";
const SUBJECT = "8f7d1c22-0000-4a7b-9b1e-aaaabbbbcccc";

// A unique JWKS URI per test keeps the module-level JwksClient cache from carrying a client between
// cases.
let jwksUriCounter = 0;
const nextJwksUri = () => {
  jwksUriCounter += 1;
  return `https://adfs.example.com/adfs/discovery/keys?case=${jwksUriCounter}`;
};

// Same reason, for the discovery document cache: a case that wants its own mocked document needs its own
// URL, or it reads the previous case's cached one.
let discoveryCaseCounter = 0;
const nextIssuerBase = () => {
  discoveryCaseCounter += 1;
  return `${ISSUER}/case-${discoveryCaseCounter}`;
};
const nextDiscoveryUrl = () => `${nextIssuerBase()}/.well-known/openid-configuration`;

const buildOidcConfig = (overrides: Partial<TOidcConfigs> = {}): TOidcConfigs =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    orgId: "22222222-2222-2222-2222-222222222222",
    configurationType: OIDCConfigurationType.CUSTOM,
    issuer: ISSUER,
    jwksUri: nextJwksUri(),
    discoveryURL: null,
    authorizationEndpoint: `${ISSUER}/authorize`,
    tokenEndpoint: `${ISSUER}/token`,
    userinfoEndpoint: `${ISSUER}/userinfo`,
    allowedEmailDomains: null,
    isActive: true,
    manageGroupMemberships: false,
    jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.RS256,
    ...overrides
  }) as TOidcConfigs;

type TSignOptions = {
  privateKeyPem?: string;
  audience?: string | string[];
  issuer?: string;
  algorithm?: jwt.Algorithm;
  expiresIn?: string | number | null;
  notBefore?: string | number;
  subject?: string | null;
  keyId?: string | null;
};

const signSubjectToken = ({
  privateKeyPem = PRIVATE_KEY_PEM,
  audience = AUDIENCE,
  issuer = ISSUER,
  algorithm = "RS256",
  expiresIn = "10m",
  notBefore,
  subject = SUBJECT,
  keyId = "adfs-key-1"
}: TSignOptions = {}) =>
  jwt.sign({ ...(subject ? { sub: subject } : {}) }, privateKeyPem, {
    algorithm,
    audience,
    issuer,
    ...(expiresIn !== null ? { expiresIn } : {}),
    ...(notBefore !== undefined ? { notBefore } : {}),
    ...(keyId ? { keyid: keyId } : {})
  });

// jsonwebtoken cannot sign EdDSA, so the EdDSA cases mint their tokens with jose.
const signEddsaSubjectToken = async ({
  audience = AUDIENCE,
  issuer = ISSUER
}: { audience?: string; issuer?: string } = {}) => {
  const signingKey = await importPKCS8(ED25519_PRIVATE_KEY_PEM, OIDCJWTSignatureAlgorithm.EDDSA);

  return new SignJWT({ sub: SUBJECT })
    .setProtectedHeader({ alg: OIDCJWTSignatureAlgorithm.EDDSA, kid: "adfs-key-1" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("10m")
    .sign(signingKey);
};

beforeAll(async () => {
  process.env.FIPS_ENABLED = "false";
  await crypto.initialize({} as never, {} as never, {} as never);
});

afterAll(() => {
  delete process.env.FIPS_ENABLED;
});

beforeEach(() => {
  vi.clearAllMocks();
  buildSsrfSafeAgent.mockResolvedValue(undefined);
  getSigningKey.mockResolvedValue({ getPublicKey: () => PUBLIC_KEY_PEM });
});

describe("resolveOidcTrustAnchor", () => {
  test("uses the stored issuer and JWKS URI for a custom configuration", async () => {
    const oidcConfig = buildOidcConfig();

    await expect(resolveOidcTrustAnchor(oidcConfig)).resolves.toEqual({
      issuer: ISSUER,
      jwksUri: oidcConfig.jwksUri,
      algorithm: OIDCJWTSignatureAlgorithm.RS256
    });
  });

  test("rejects a symmetric signature algorithm", async () => {
    const oidcConfig = buildOidcConfig({ jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.HS256 });

    await expect(resolveOidcTrustAnchor(oidcConfig)).rejects.toThrow(/asymmetric JWT signature algorithm/);
  });

  test("rejects a custom configuration with no issuer", async () => {
    await expect(resolveOidcTrustAnchor(buildOidcConfig({ issuer: null }))).rejects.toThrow(
      /missing an issuer or JWKS URI/
    );
  });

  test("rejects a custom configuration with no JWKS URI", async () => {
    await expect(resolveOidcTrustAnchor(buildOidcConfig({ jwksUri: null }))).rejects.toThrow(
      /missing an issuer or JWKS URI/
    );
  });

  test("resolves the JWKS URI through discovery when configured that way", async () => {
    const discoveredJwksUri = nextJwksUri();
    safeGet.mockResolvedValue({ data: { jwks_uri: discoveredJwksUri, issuer: ISSUER } });

    const oidcConfig = buildOidcConfig({
      configurationType: OIDCConfigurationType.DISCOVERY_URL,
      discoveryURL: nextDiscoveryUrl(),
      issuer: null,
      jwksUri: null
    });

    await expect(resolveOidcTrustAnchor(oidcConfig)).resolves.toEqual({
      issuer: ISSUER,
      jwksUri: discoveredJwksUri,
      algorithm: OIDCJWTSignatureAlgorithm.RS256
    });
    expect(safeGet).toHaveBeenCalledWith(oidcConfig.discoveryURL);
  });

  test("appends the well-known path when the discovery URL is an issuer base", async () => {
    safeGet.mockResolvedValue({ data: { jwks_uri: nextJwksUri(), issuer: ISSUER } });
    const issuerBase = nextIssuerBase();

    await resolveOidcTrustAnchor(
      buildOidcConfig({ configurationType: OIDCConfigurationType.DISCOVERY_URL, discoveryURL: `${issuerBase}/` })
    );

    expect(safeGet).toHaveBeenCalledWith(`${issuerBase}/.well-known/openid-configuration`);
  });

  test("prefers the stored issuer over the discovered one", async () => {
    safeGet.mockResolvedValue({ data: { jwks_uri: nextJwksUri(), issuer: "https://attacker.example.com" } });

    const anchor = await resolveOidcTrustAnchor(
      buildOidcConfig({
        configurationType: OIDCConfigurationType.DISCOVERY_URL,
        discoveryURL: nextDiscoveryUrl()
      })
    );

    expect(anchor.issuer).toEqual(ISSUER);
  });

  test("reports an unreachable identity provider without leaking the transport error", async () => {
    safeGet.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5:443"));

    await expect(
      resolveOidcTrustAnchor(
        buildOidcConfig({
          configurationType: OIDCConfigurationType.DISCOVERY_URL,
          discoveryURL: nextDiscoveryUrl()
        })
      )
    ).rejects.toThrow(/Could not reach your organization's identity provider/);
  });

  test("rejects a discovery document with no jwks_uri", async () => {
    safeGet.mockResolvedValue({ data: { issuer: ISSUER } });

    await expect(
      resolveOidcTrustAnchor(
        buildOidcConfig({
          configurationType: OIDCConfigurationType.DISCOVERY_URL,
          discoveryURL: nextDiscoveryUrl()
        })
      )
    ).rejects.toThrow(/did not publish a 'jwks_uri'/);
  });

  test("rejects a discovery configuration with no discovery URL", async () => {
    await expect(
      resolveOidcTrustAnchor(
        buildOidcConfig({ configurationType: OIDCConfigurationType.DISCOVERY_URL, discoveryURL: null })
      )
    ).rejects.toThrow(/no discovery URL/);
  });

  // Token exchange runs on every request the middleware makes, so the discovery document must not be a
  // per-exchange round trip to the identity provider.
  test("fetches the discovery document once across repeated resolutions", async () => {
    safeGet.mockResolvedValue({ data: { jwks_uri: nextJwksUri(), issuer: ISSUER } });
    const discoveryURL = nextDiscoveryUrl();
    const build = () => buildOidcConfig({ configurationType: OIDCConfigurationType.DISCOVERY_URL, discoveryURL });

    const [first, second, third] = await Promise.all([
      resolveOidcTrustAnchor(build()),
      resolveOidcTrustAnchor(build()),
      resolveOidcTrustAnchor(build())
    ]);
    await resolveOidcTrustAnchor(build());

    // Concurrent cold-entry callers coalesce onto one fetch rather than each opening their own.
    expect(safeGet).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  // Caching a failure would stretch a provider blip into a full TTL of failures.
  test("retries after a failed discovery fetch instead of caching the failure", async () => {
    const discoveryURL = nextDiscoveryUrl();
    const build = () => buildOidcConfig({ configurationType: OIDCConfigurationType.DISCOVERY_URL, discoveryURL });

    safeGet.mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.5:443"));
    await expect(resolveOidcTrustAnchor(build())).rejects.toThrow(/Could not reach/);

    const discoveredJwksUri = nextJwksUri();
    safeGet.mockResolvedValue({ data: { jwks_uri: discoveredJwksUri, issuer: ISSUER } });

    await expect(resolveOidcTrustAnchor(build())).resolves.toMatchObject({ jwksUri: discoveredJwksUri });
    expect(safeGet).toHaveBeenCalledTimes(2);
  });

  // The algorithm and the preferred issuer come from the org's own configuration, so only the fetch is
  // cached: an admin editing either must not have to wait out the discovery TTL.
  test("does not cache configuration read from the organization's own record", async () => {
    safeGet.mockResolvedValue({ data: { jwks_uri: nextJwksUri(), issuer: ISSUER } });
    const discoveryURL = nextDiscoveryUrl();

    const before = await resolveOidcTrustAnchor(
      buildOidcConfig({ configurationType: OIDCConfigurationType.DISCOVERY_URL, discoveryURL })
    );
    expect(before.algorithm).toEqual(OIDCJWTSignatureAlgorithm.RS256);

    const after = await resolveOidcTrustAnchor(
      buildOidcConfig({
        configurationType: OIDCConfigurationType.DISCOVERY_URL,
        discoveryURL,
        jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.RS512,
        issuer: "https://adfs.example.com/updated"
      })
    );

    expect(after.algorithm).toEqual(OIDCJWTSignatureAlgorithm.RS512);
    expect(after.issuer).toEqual("https://adfs.example.com/updated");
    expect(safeGet).toHaveBeenCalledTimes(1);
  });
});

describe("verifySubjectToken", () => {
  const verify = (subjectToken: string, oidcConfig = buildOidcConfig(), expectedAudience = AUDIENCE) =>
    verifySubjectToken({ subjectToken, oidcConfig, expectedAudience });

  test("returns the subject of a valid token", async () => {
    await expect(verify(signSubjectToken())).resolves.toEqual({ subject: SUBJECT, issuer: ISSUER });
  });

  test("accepts a token whose audience list contains the expected audience", async () => {
    const token = signSubjectToken({ audience: ["api://other-app", AUDIENCE] });

    await expect(verify(token)).resolves.toMatchObject({ subject: SUBJECT });
  });

  // The control that stops any token the issuer signed, for any application, being replayed here.
  test("rejects a token minted for a different application", async () => {
    const token = signSubjectToken({ audience: "api://expenses-app" });

    await expect(verify(token)).rejects.toThrow(/audience does not match/);
  });

  test("rejects a token from a different issuer", async () => {
    const token = signSubjectToken({ issuer: "https://attacker.example.com" });

    await expect(verify(token)).rejects.toThrow(/not issued by your organization's configured OIDC SSO issuer/);
  });

  test("rejects an expired token", async () => {
    const token = signSubjectToken({ expiresIn: -60 });

    await expect(verify(token)).rejects.toThrow(/has expired/);
  });

  // 'exp' is optional in RFC 7519, so a token that omits it would otherwise stay exchangeable forever.
  test("rejects a token with no exp claim", async () => {
    const token = signSubjectToken({ expiresIn: null });

    await expect(verify(token)).rejects.toThrow(/no 'exp' claim/);
  });

  test("rejects a token that is not yet valid", async () => {
    const token = signSubjectToken({ notBefore: 600 });

    await expect(verify(token)).rejects.toThrow(/not valid yet/);
  });

  test("rejects a token signed by a key the provider does not publish", async () => {
    const token = signSubjectToken({ privateKeyPem: OTHER_PRIVATE_KEY_PEM });

    await expect(verify(token)).rejects.toThrow(/could not be verified against your organization/);
  });

  // Pinning `algorithms` closes this off before the signature is ever looked at.
  test("rejects an unsigned (alg: none) token", async () => {
    const token = jwt.sign({ sub: SUBJECT, aud: AUDIENCE, iss: ISSUER }, "", {
      algorithm: "none",
      keyid: "adfs-key-1"
    });

    await expect(verify(token)).rejects.toThrow(/not signed with the algorithm/);
  });

  test("rejects a token signed with an algorithm the configuration does not expect", async () => {
    const token = signSubjectToken({ algorithm: "RS512" });

    await expect(verify(token)).rejects.toThrow(/not signed with the algorithm/);
  });

  // EdDSA is selectable in the OIDC SSO configuration and works for browser SSO login, so it has to work
  // here too. jsonwebtoken cannot verify it at all, which is why verification runs through jose.
  test("verifies an EdDSA-signed token for an EdDSA configuration", async () => {
    getSigningKey.mockResolvedValue({ getPublicKey: () => ED25519_PUBLIC_KEY_PEM });
    const token = await signEddsaSubjectToken();

    await expect(
      verify(token, buildOidcConfig({ jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.EDDSA }))
    ).resolves.toEqual({ subject: SUBJECT, issuer: ISSUER });
  });

  test("still enforces the audience on an EdDSA-signed token", async () => {
    getSigningKey.mockResolvedValue({ getPublicKey: () => ED25519_PUBLIC_KEY_PEM });
    const token = await signEddsaSubjectToken({ audience: "api://expenses-app" });

    await expect(
      verify(token, buildOidcConfig({ jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.EDDSA }))
    ).rejects.toThrow(/audience does not match/);
  });

  // An RSA key cannot carry EdDSA. That is the provider's configuration disagreeing with itself, not a
  // bad token, so it must not surface as an unhandled 500.
  test("reports a signing key that cannot carry the configured algorithm", async () => {
    const token = await signEddsaSubjectToken();

    await expect(
      verify(token, buildOidcConfig({ jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.EDDSA }))
    ).rejects.toThrow(/cannot be used with the JWT signature algorithm/);
  });

  test("rejects a token with no kid header", async () => {
    const token = signSubjectToken({ keyId: null });

    await expect(verify(token)).rejects.toThrow(/no 'kid' header/);
  });

  test("rejects a token whose kid the provider does not publish", async () => {
    const notFound = new Error("key not found");
    notFound.name = "SigningKeyNotFoundError";
    getSigningKey.mockRejectedValue(notFound);

    await expect(verify(signSubjectToken())).rejects.toThrow(/does not publish/);
  });

  test("reports a JWKS fetch failure without leaking the transport error", async () => {
    getSigningKey.mockRejectedValue(new Error("connect ETIMEDOUT 10.0.0.5:443"));

    await expect(verify(signSubjectToken())).rejects.toThrow(/Could not load signing keys/);
  });

  test("rejects a token with no sub claim", async () => {
    const token = signSubjectToken({ subject: null });

    await expect(verify(token)).rejects.toThrow(/no 'sub' claim/);
  });

  test("rejects a malformed token without echoing the parser error", async () => {
    await expect(verify("not-a-jwt")).rejects.toThrow(/not a well-formed JWT/);
  });

  test("pins the JWKS connection to the validated IPs", async () => {
    const oidcConfig = buildOidcConfig();

    await verify(signSubjectToken(), oidcConfig);

    expect(buildSsrfSafeAgent).toHaveBeenCalledWith(oidcConfig.jwksUri);
  });

  test("rejects a JWKS URI that resolves to a private address", async () => {
    buildSsrfSafeAgent.mockRejectedValue(new Error("Local IPs not allowed as URL"));

    await expect(verify(signSubjectToken())).rejects.toThrow(/Could not load signing keys/);
  });
});
