import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE } from "@app/lib/validator";

import {
  authorizationServerMetadataUrls,
  checkIssuer,
  checkProtectedResource,
  discoverOauthServer,
  isOauthScopeToken,
  MAX_OAUTH_SCOPES,
  parseBearerChallenge,
  protectedResourceMetadataUrls,
  selectScopes
} from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient } from "./agent-vault-oauth-http-fns";
import { AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

type TStubServer = {
  challenge?: string | null;
  probeThrows?: boolean;
  getThrows?: boolean;
  // Requests that never answer, as a hung server's would.
  hang?: boolean;
  hangUrls?: string[];
  json: Record<string, unknown>;
};

const stubHttp = ({
  challenge = null,
  probeThrows = false,
  getThrows = false,
  hang = false,
  hangUrls = [],
  json
}: TStubServer) => {
  const fetched: string[] = [];
  const never = () =>
    new Promise<never>(() => {
      /* never settles */
    });
  const http: TOauthHttpClient = {
    probe: async () => {
      if (hang) return never();
      if (probeThrows) throw new Error("connect ECONNREFUSED");
      return { status: 401, wwwAuthenticate: challenge };
    },
    get: async (url) => {
      fetched.push(url);
      if (hang || hangUrls.includes(url)) return never();
      if (getThrows) throw new Error("getaddrinfo ENOTFOUND");
      return url in json
        ? { status: 200, contentType: "application/json", body: JSON.stringify(json[url]) }
        : { status: 404, contentType: "text/plain", body: "not found" };
    },
    postForm: async () => {
      throw new Error("unexpected");
    },
    postJson: async () => {
      throw new Error("unexpected");
    }
  };
  return { http, fetched };
};

const LINEAR_AS = {
  issuer: "https://mcp.linear.app",
  authorization_endpoint: "https://mcp.linear.app/authorize",
  token_endpoint: "https://mcp.linear.app/token",
  registration_endpoint: "https://mcp.linear.app/register",
  scopes_supported: ["read", "write", "openid", "email"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  authorization_response_iss_parameter_supported: true
};

describe("parsing the WWW-Authenticate challenge", () => {
  test("Unicode whitespace and vertical tabs still delimit challenges and parameters", () => {
    expect(parseBearerChallenge('Basic realm="x",\u00a0Bearer\vscope\u2028=\ufeff"read write"')).toEqual({
      scope: "read write"
    });
  });
  test("reads resource_metadata and scope", () => {
    expect(
      parseBearerChallenge(
        'Bearer realm="OAuth", resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp", scope="read write"'
      )
    ).toEqual({
      realm: "OAuth",
      resource_metadata: "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp",
      scope: "read write"
    });
  });

  test("keeps commas and escaped quotes inside quoted values", () => {
    expect(
      parseBearerChallenge('Bearer error="invalid_request", error_description="No token, \\"really\\"", scope=repo')
    ).toEqual({ error: "invalid_request", error_description: 'No token, "really"', scope: "repo" });
  });

  test("finds the Bearer challenge among others and stops at the next scheme", () => {
    expect(parseBearerChallenge('Basic realm="x", Bearer scope="a" , DPoP algs="ES256"')).toEqual({ scope: "a" });
  });

  test("malformed parameters end this challenge instead of skipping forward into another", () => {
    expect(parseBearerChallenge('Bearer scope="read", broken, DPoP error="other-challenge"')).toEqual({
      scope: "read"
    });
  });

  test("no Bearer challenge is null", () => {
    expect(parseBearerChallenge('Basic realm="x"')).toBeNull();
    expect(parseBearerChallenge(null)).toBeNull();
  });
});

describe("where metadata is looked for", () => {
  test("protected resource: the challenge's URL, then the path-suffixed and root well-known URLs", () => {
    expect(
      protectedResourceMetadataUrls("https://mcp.example.com/mcp", "https://mcp.example.com/.well-known/custom")
    ).toEqual([
      "https://mcp.example.com/.well-known/custom",
      "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
      "https://mcp.example.com/.well-known/oauth-protected-resource"
    ]);
  });

  test("protected resource: a non-https challenge URL is ignored, and a root server has one candidate", () => {
    expect(protectedResourceMetadataUrls("https://mcp.example.com/", "http://evil.example.com/prm")).toEqual([
      "https://mcp.example.com/.well-known/oauth-protected-resource"
    ]);
  });

  test("authorization server with a path: RFC 8414 then both OpenID forms", () => {
    expect(authorizationServerMetadataUrls("https://github.com/login/oauth")).toEqual([
      "https://github.com/.well-known/oauth-authorization-server/login/oauth",
      "https://github.com/.well-known/openid-configuration/login/oauth",
      "https://github.com/login/oauth/.well-known/openid-configuration"
    ]);
  });

  test("authorization server without a path", () => {
    expect(authorizationServerMetadataUrls("https://mcp.linear.app/")).toEqual([
      "https://mcp.linear.app/.well-known/oauth-authorization-server",
      "https://mcp.linear.app/.well-known/openid-configuration"
    ]);
  });
});

describe("checking the protected resource against the server URL", () => {
  test("an exact match, ignoring a trailing slash", () => {
    expect(checkProtectedResource("https://mcp.example.com/mcp", "https://mcp.example.com/mcp")).toEqual({
      resource: "https://mcp.example.com/mcp",
      compatibility: null
    });
    expect(checkProtectedResource("https://api.example.com/mcp", "https://api.example.com/mcp/").compatibility).toBe(
      null
    );
  });

  test("a same-origin path prefix is accepted, and that value is what gets sent", () => {
    expect(checkProtectedResource("https://mcp.example.com/mcp/v2", "https://mcp.example.com/mcp")).toEqual({
      resource: "https://mcp.example.com/mcp",
      compatibility: AgentVaultOauthCompatibility.ResourcePrefix
    });
    expect(checkProtectedResource("https://mcp.example.com/mcp", "https://mcp.example.com").compatibility).toBe(
      AgentVaultOauthCompatibility.ResourcePrefix
    );
  });

  test("a different origin is rejected", () => {
    expect(() => checkProtectedResource("https://mcp.example.com/mcp", "https://other.example.com/mcp")).toThrow(
      /different server/
    );
  });

  test("a path that only shares characters is not a prefix", () => {
    expect(() => checkProtectedResource("https://mcp.example.com/mcpx", "https://mcp.example.com/mcp")).toThrow(
      /doesn't cover/
    );
  });

  test("a missing resource falls back to the server URL", () => {
    expect(checkProtectedResource("https://mcp.example.com/mcp", undefined)).toEqual({
      resource: "https://mcp.example.com/mcp",
      compatibility: AgentVaultOauthCompatibility.ResourceMissing
    });
  });
});

describe("issuer validation", () => {
  test("must equal the issuer the metadata was fetched for", () => {
    expect(checkIssuer("https://s.example.com", "https://as.example.com", "https://as.example.com")).toBeNull();
    expect(() => checkIssuer("https://s.example.com", "https://as.example.com", "https://evil.example.com")).toThrow(
      /different issuer/
    );
    expect(() => checkIssuer("https://s.example.com", "https://as.example.com", undefined)).toThrow(/different issuer/);
  });

  test("a trailing slash difference is accepted and recorded", () => {
    expect(checkIssuer("https://s.example.com", "https://as.example.com", "https://as.example.com/")).toBe(
      AgentVaultOauthCompatibility.IssuerTrailingSlash
    );
  });
});

describe("scope selection", () => {
  test("the challenge's scope wins", () => {
    expect(selectScopes({ challengeScope: "read write", scopesSupported: ["admin"] })).toEqual(["read", "write"]);
  });

  test("then the protected resource's scopes_supported", () => {
    expect(selectScopes({ scopesSupported: ["repo", "gist"] })).toEqual(["repo", "gist"]);
  });

  test("else nothing is requested", () => {
    expect(selectScopes({})).toEqual([]);
  });

  test("offline_access is added only when the authorization server lists it", () => {
    expect(selectScopes({ challengeScope: "read", authorizationServerScopes: ["offline_access"] })).toEqual([
      "read",
      "offline_access"
    ]);
    expect(selectScopes({ challengeScope: "read", authorizationServerScopes: ["read"] })).toEqual(["read"]);
  });

  test("scopes that aren't OAuth scope tokens are dropped from the challenge and from scopes_supported", () => {
    expect(selectScopes({ challengeScope: 'read wr"ite a\\b \u0000 \tadmin' })).toEqual(["read"]);
    expect(
      selectScopes({ scopesSupported: ["repo", "has space", "nul\u0000", "", 7, "x".repeat(257), "gist"] })
    ).toEqual(["repo", "gist"]);
  });
});

describe("the OAuth scope-token grammar (RFC 6749 section 3.3)", () => {
  test("accepts printable ASCII other than space, quote and backslash", () => {
    for (const scope of ["read", "repo:status", "https://graph.example/.default", "!#[]~", "x".repeat(256)]) {
      expect(isOauthScopeToken(scope)).toBe(true);
    }
  });

  test("refuses empty, whitespace, quotes, backslashes, control and non-ASCII characters, and long scopes", () => {
    for (const scope of ["", " ", "a b", "a\tb", 'a"b', "a\\b", "\u0000", "a\u007fb", "caf\u00e9", "x".repeat(257)]) {
      expect(isOauthScopeToken(scope)).toBe(false);
    }
    expect(isOauthScopeToken(undefined)).toBe(false);
  });
});

describe("discovering an MCP server's authorization server", () => {
  test("a conforming server (Linear): challenge, protected resource, then authorization server metadata", async () => {
    const { http, fetched } = stubHttp({
      challenge:
        'Bearer realm="OAuth", resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp", scope="read write"',
      json: {
        "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
          resource: "https://mcp.linear.app/mcp",
          authorization_servers: ["https://mcp.linear.app"],
          scopes_supported: ["read", "write"]
        },
        "https://mcp.linear.app/.well-known/oauth-authorization-server": LINEAR_AS
      }
    });

    expect(await discoverOauthServer(http, "https://mcp.linear.app/mcp")).toEqual({
      issuer: "https://mcp.linear.app",
      authorizationEndpoint: "https://mcp.linear.app/authorize",
      tokenEndpoint: "https://mcp.linear.app/token",
      registrationEndpoint: "https://mcp.linear.app/register",
      endpointsGuessed: false,
      resource: "https://mcp.linear.app/mcp",
      scopes: ["read", "write"],
      issParameterSupported: true,
      tokenEndpointAuthMethodsSupported: ["client_secret_basic", "client_secret_post", "none"],
      grantTypesSupported: ["authorization_code", "refresh_token"],
      compatibility: [],
      oauthAdvertised: true
    });
    // Each group is asked at once; the challenge's URL is one of the well-known ones, so it isn't asked twice.
    expect(fetched).toEqual([
      "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp",
      "https://mcp.linear.app/.well-known/oauth-protected-resource",
      "https://mcp.linear.app/.well-known/oauth-authorization-server",
      "https://mcp.linear.app/.well-known/openid-configuration"
    ]);
  });

  test("lower-priority URLs that never answer don't hold up the preferred ones", async () => {
    const { http } = stubHttp({
      challenge: 'Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"',
      hangUrls: [
        "https://mcp.linear.app/.well-known/oauth-protected-resource",
        "https://mcp.linear.app/.well-known/openid-configuration"
      ],
      json: {
        "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
          resource: "https://mcp.linear.app/mcp",
          authorization_servers: ["https://mcp.linear.app"]
        },
        "https://mcp.linear.app/.well-known/oauth-authorization-server": LINEAR_AS
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.linear.app/mcp", 1000)).resolves.toMatchObject({
      tokenEndpoint: "https://mcp.linear.app/token"
    });
  });

  test("an issuer with a path and no registration endpoint (GitHub)", async () => {
    const { http, fetched } = stubHttp({
      challenge:
        'Bearer error="invalid_request", error_description="No access token was provided in this request", resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"',
      json: {
        "https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/": {
          resource: "https://api.githubcopilot.com/mcp/",
          authorization_servers: ["https://github.com/login/oauth"],
          scopes_supported: ["repo", "read:org"]
        },
        "https://github.com/.well-known/oauth-authorization-server/login/oauth": {
          issuer: "https://github.com/login/oauth",
          authorization_endpoint: "https://github.com/login/oauth/authorize",
          token_endpoint: "https://github.com/login/oauth/access_token",
          code_challenge_methods_supported: ["S256"],
          authorization_response_iss_parameter_supported: true,
          scopes_supported: ["offline_access"]
        }
      }
    });

    const discovery = await discoverOauthServer(http, "https://api.githubcopilot.com/mcp/");
    expect(discovery.registrationEndpoint).toBeNull();
    expect(discovery.scopes).toEqual(["repo", "read:org", "offline_access"]);
    expect(discovery.resource).toBe("https://api.githubcopilot.com/mcp/");
    expect(fetched).toContain("https://github.com/.well-known/oauth-authorization-server/login/oauth");
  });

  test("without a challenge, the well-known locations are tried in order", async () => {
    const { http, fetched } = stubHttp({
      probeThrows: true,
      json: {
        "https://mcp.example.com/.well-known/oauth-protected-resource": {
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://auth.example.com"]
        },
        "https://auth.example.com/.well-known/openid-configuration": {
          issuer: "https://auth.example.com",
          authorization_endpoint: "https://auth.example.com/oauth/authorize",
          token_endpoint: "https://auth.example.com/oauth/token",
          code_challenge_methods_supported: ["plain", "S256"]
        }
      }
    });

    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(fetched).toEqual([
      "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
      "https://mcp.example.com/.well-known/oauth-protected-resource",
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration"
    ]);
    expect(discovery.issuer).toBe("https://auth.example.com");
    expect(discovery.scopes).toEqual([]);
    expect(discovery.issParameterSupported).toBe(false);
  });

  test("no protected resource metadata: the MCP origin is the authorization server", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          authorization_endpoint: "https://mcp.example.com/authorize",
          token_endpoint: "https://mcp.example.com/token",
          registration_endpoint: "https://mcp.example.com/register"
        }
      }
    });

    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(discovery.issuer).toBe("https://mcp.example.com");
    expect(discovery.resource).toBe("https://mcp.example.com/mcp");
    expect(discovery.compatibility).toEqual([AgentVaultOauthCompatibility.NoProtectedResourceMetadata]);
  });

  test("no metadata at all: default endpoints at the origin", async () => {
    const { http } = stubHttp({ json: {} });

    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(discovery).toMatchObject({
      issuer: "https://mcp.example.com",
      authorizationEndpoint: "https://mcp.example.com/authorize",
      tokenEndpoint: "https://mcp.example.com/token",
      registrationEndpoint: "https://mcp.example.com/register",
      endpointsGuessed: true
    });
    expect(discovery.compatibility).toEqual(
      expect.arrayContaining([
        AgentVaultOauthCompatibility.NoProtectedResourceMetadata,
        AgentVaultOauthCompatibility.NoAuthorizationServerMetadata
      ])
    );
  });

  test("a protected resource for another origin is rejected", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-protected-resource/mcp": {
          resource: "https://attacker.example.net/mcp",
          authorization_servers: ["https://auth.example.com"]
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(
      "Couldn't set up OAuth for 'mcp.example.com': its protected resource metadata is for 'attacker.example.net', a different server. Check the server URL."
    );
  });

  test("an authorization server naming another issuer is rejected", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://evil.example"
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(/different issuer/);
  });

  test("an issuer differing by a trailing slash is accepted", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com/"
        }
      }
    });
    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(discovery.compatibility).toContain(AgentVaultOauthCompatibility.IssuerTrailingSlash);
  });

  test("PKCE: refused when the list exists without S256, assumed when there is no list", async () => {
    const withoutS256 = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          code_challenge_methods_supported: ["plain"]
        }
      }
    });
    await expect(discoverOauthServer(withoutS256.http, "https://mcp.example.com/mcp")).rejects.toThrow(/S256/);

    const { code_challenge_methods_supported: omitted, ...withoutList } = LINEAR_AS;
    const unadvertised = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...withoutList,
          issuer: "https://mcp.example.com"
        }
      }
    });
    const discovery = await discoverOauthServer(unadvertised.http, "https://mcp.example.com/mcp");
    expect(discovery.compatibility).toContain(AgentVaultOauthCompatibility.PkceUnadvertised);
  });

  test("a challenge URL that answers wins over a well-known URL that also does", async () => {
    const { http, fetched } = stubHttp({
      challenge: 'Bearer resource_metadata="https://meta.example.com/prm"',
      json: {
        "https://meta.example.com/prm": {
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://auth-from-challenge.example.com"]
        },
        "https://mcp.example.com/.well-known/oauth-protected-resource/mcp": {
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://auth-well-known.example.com"]
        },
        "https://auth-from-challenge.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://auth-from-challenge.example.com"
        },
        "https://auth-from-challenge.example.com/.well-known/openid-configuration": {
          ...LINEAR_AS,
          issuer: "https://auth-from-challenge.example.com",
          authorization_endpoint: "https://auth-from-challenge.example.com/second"
        }
      }
    });

    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(discovery.issuer).toBe("https://auth-from-challenge.example.com");
    expect(discovery.authorizationEndpoint).toBe(LINEAR_AS.authorization_endpoint);
    expect(fetched).toContain("https://meta.example.com/prm");
  });

  test("a server where nothing answers is unreachable, so the URL is what to check", async () => {
    const { http } = stubHttp({ probeThrows: true, getThrows: true, json: {} });
    await expect(discoverOauthServer(http, "https://mcp.typo.example.com/mcp")).rejects.toThrow(
      "Couldn't reach 'mcp.typo.example.com'. Check the server URL and that the server is online."
    );
  });

  test("a server on a private network says so, since checking the URL or retrying won't help", async () => {
    const { http } = stubHttp({ getThrows: true, json: {} });
    const refused: TOauthHttpClient = {
      ...http,
      probe: async () => {
        throw new BadRequestError({ message: PRIVATE_ADDRESS_REFUSED_MESSAGE });
      }
    };
    await expect(discoverOauthServer(refused, "https://mcp.internal.example.com/mcp")).rejects.toThrow(
      "Infisical can't reach 'mcp.internal.example.com' because it's on a private network. Use a bearer token for this service instead."
    );
  });

  test("an authorization server that is down is reported instead of guessing its endpoints", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-protected-resource/mcp": {
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://login.example.com/tenant"]
        }
      }
    });
    const outage: TOauthHttpClient = {
      ...http,
      get: async (url) =>
        url.startsWith("https://login.example.com")
          ? { status: 503, contentType: "text/plain", body: "unavailable" }
          : http.get(url)
    };
    await expect(discoverOauthServer(outage, "https://mcp.example.com/mcp")).rejects.toThrow(
      "Couldn't reach the authorization server 'login.example.com'. Try again in a few minutes."
    );
  });

  test("a server that answers without any OAuth signal is not advertised, but still gets guessed endpoints", async () => {
    const { http } = stubHttp({ challenge: null, json: {} });
    const discovery = await discoverOauthServer(http, "https://mcp.example.com/mcp");
    expect(discovery.oauthAdvertised).toBe(false);
    expect(discovery.endpointsGuessed).toBe(true);
  });

  test("a Bearer challenge alone counts as advertising OAuth", async () => {
    const { http } = stubHttp({ challenge: 'Bearer realm="mcp"', json: {} });
    expect((await discoverOauthServer(http, "https://mcp.example.com/mcp")).oauthAdvertised).toBe(true);
  });

  test("a server that hangs fails within the discovery budget, saying it took too long", async () => {
    const { http } = stubHttp({ hang: true, json: {} });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp", 20)).rejects.toThrow(
      "Couldn't set up OAuth for 'mcp.example.com': it took too long to respond. Check that the server is online, then try again."
    );
  });

  test("a server asking for more scopes than the cap is refused with the count", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-protected-resource": {
          resource: "https://mcp.example.com/mcp",
          authorization_servers: ["https://mcp.example.com"],
          scopes_supported: Array.from({ length: MAX_OAUTH_SCOPES + 1 }, (_, index) => `scope:${index}`)
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(
      `it asks for ${MAX_OAUTH_SCOPES + 1} OAuth scopes, more than the ${MAX_OAUTH_SCOPES} Infisical supports.`
    );
  });

  test("an authorization server with a plain-http token endpoint is rejected", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          token_endpoint: "http://mcp.example.com/token"
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(/https/);
  });

  test("an endpoint URL that isn't printable ASCII is rejected, since it would be stored as sent", async () => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          token_endpoint: "https://mcp.example.com/tok\u0000en"
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(/https/);

    const registration = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          registration_endpoint: "https://mcp.example.com/reg\ud800"
        }
      }
    });
    const discovery = await discoverOauthServer(registration.http, "https://mcp.example.com/mcp");
    expect(discovery.registrationEndpoint).toBeNull();
  });

  test.each([
    "https://user:secret@mcp.example.com/token",
    "https://mcp.example.com/token#fragment",
    "https://mcp.example.com/token#"
  ])("an endpoint with embedded credentials or a fragment is rejected: %s", async (tokenEndpoint) => {
    const { http } = stubHttp({
      json: {
        "https://mcp.example.com/.well-known/oauth-authorization-server": {
          ...LINEAR_AS,
          issuer: "https://mcp.example.com",
          token_endpoint: tokenEndpoint
        }
      }
    });
    await expect(discoverOauthServer(http, "https://mcp.example.com/mcp")).rejects.toThrow(
      /without usernames, passwords or fragments/
    );
  });
});
