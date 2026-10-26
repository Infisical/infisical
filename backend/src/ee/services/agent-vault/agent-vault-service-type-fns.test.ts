import { describe, expect, test } from "vitest";

import { AgentVaultCredentialType, AgentVaultMcpTransport, AgentVaultServiceType } from "./agent-vault-enums";
import {
  AGENT_VAULT_SERVICE_TYPES,
  agentVaultMcpServerUrlSchema,
  assertCredentialTypeSupported,
  assertServiceFieldsSupported,
  buildServiceConfig,
  deriveMcpHostPattern,
  dropReadBackServiceFields,
  findUnsupportedServiceFields,
  resolveServiceHostPattern
} from "./agent-vault-service-type-fns";

const http = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Http];
const mcp = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Mcp];

describe("deriving an MCP service's host pattern", () => {
  test.each([
    { url: "https://mcp.linear.app/mcp", pattern: "mcp.linear.app", why: "no port means 443" },
    { url: "https://MCP.Linear.App/mcp", pattern: "mcp.linear.app", why: "lowercased" },
    { url: "https://mcp.linear.app:443/mcp", pattern: "mcp.linear.app", why: "an explicit 443 is dropped" },
    { url: "https://mcp.example.com:8443/mcp", pattern: "mcp.example.com:8443", why: "another port is kept" },
    { url: "https://mcp.example.com.:8443/", pattern: "mcp.example.com:8443", why: "trailing dot" },
    { url: "https://10.0.1.5:8200/mcp", pattern: "10.0.1.5:8200", why: "IPv4 literal" },
    { url: "https://[::1]:8443/mcp", pattern: "[::1]:8443", why: "IPv6 literal" },
    { url: "https://api.githubcopilot.com/mcp/", pattern: "api.githubcopilot.com", why: "path ignored" }
  ])("$url -> $pattern ($why)", ({ url, pattern }) => {
    expect(deriveMcpHostPattern(url)).toBe(pattern);
    expect(resolveServiceHostPattern(mcp, buildServiceConfig(mcp, { serverUrl: url, transport: "sse" }), "x.com")).toBe(
      pattern
    );
  });
});

describe("the server URL", () => {
  test.each([
    "https://mcp.linear.app/mcp",
    "  https://mcp.notion.com/mcp  ",
    "https://mcp.example.com:8443/sse",
    "HTTPS://mcp.example.com/mcp",
    "https://mcp.example.com/日本語/😀"
  ])("accepts %s", (url) => {
    expect(agentVaultMcpServerUrlSchema.safeParse(url).success).toBe(true);
  });

  test.each([
    { url: "", why: "empty" },
    { url: "http://mcp.example.com/mcp", why: "plaintext http" },
    { url: "mcp.example.com/mcp", why: "no scheme" },
    { url: "https:mcp.example.com", why: "the URL parser would accept this as https://" },
    { url: "https://user:pass@mcp.example.com/mcp", why: "userinfo" },
    { url: "https://token@mcp.example.com/mcp", why: "username only" },
    { url: "https://mcp.example.com/mcp#frag", why: "fragment" },
    { url: "https://mcp.example.com/mcp#", why: "empty fragment" },
    { url: "https://*.example.com/mcp", why: "wildcard host" },
    { url: "https://mcp.exa mple.com/", why: "space" },
    { url: "https://mcp.example.com/\nmcp", why: "newline the URL parser would strip" },
    { url: "https://mcp.example.com/\ud800", why: "a lone high surrogate that jsonb cannot store" },
    { url: "https://mcp.example.com/\udfff", why: "a lone low surrogate that jsonb cannot store" },
    { url: "https://mcp_x.example.com/", why: "a host the host grammar can't match" },
    { url: `https://mcp.example.com/${"a".repeat(2048)}`, why: "too long" }
  ])("rejects $why", ({ url }) => {
    expect(agentVaultMcpServerUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("type config", () => {
  test("an MCP config needs both fields", () => {
    expect(() => buildServiceConfig(mcp, { serverUrl: "https://mcp.example.com/mcp" })).toThrow(/transport/);
    expect(() => buildServiceConfig(mcp, { transport: AgentVaultMcpTransport.Sse })).toThrow(/serverUrl/);
  });

  test("an update overlays what was sent on what is stored", () => {
    const stored = { serverUrl: "https://mcp.example.com/mcp", transport: AgentVaultMcpTransport.StreamableHttp };
    expect(buildServiceConfig(mcp, { transport: AgentVaultMcpTransport.Sse, serverUrl: undefined }, stored)).toEqual({
      serverUrl: "https://mcp.example.com/mcp",
      transport: AgentVaultMcpTransport.Sse
    });
  });

  test("an invalid URL is a readable error naming the field", () => {
    expect(() =>
      buildServiceConfig(mcp, { serverUrl: "http://mcp.example.com", transport: AgentVaultMcpTransport.Sse })
    ).toThrow(/'serverUrl': The server URL must start with https:\/\//);
  });

  test("a query string is refused, since the URL is stored and shown in plaintext", () => {
    expect(() =>
      buildServiceConfig(mcp, {
        serverUrl: "https://mcp.example.com/mcp?token=abc",
        transport: AgentVaultMcpTransport.StreamableHttp
      })
    ).toThrow(
      "'serverUrl': Server URLs can't include a query string, since it is stored and shown in plaintext. Put a token in the Bearer token or a custom header instead."
    );
    expect(agentVaultMcpServerUrlSchema.safeParse("https://mcp.example.com/mcp?").success).toBe(false);
  });

  test("an HTTP service's config is empty and its host pattern is what was entered", () => {
    const config = buildServiceConfig(http, {});
    expect(config).toEqual({});
    expect(resolveServiceHostPattern(http, config, "api.github.com")).toBe("api.github.com");
    expect(() => resolveServiceHostPattern(http, config, undefined)).toThrow(/host pattern/);
  });
});

describe("fields a type does not take", () => {
  test("an MCP service refuses the HTTP-only fields", () => {
    expect(
      findUnsupportedServiceFields(mcp, {
        hostPattern: "api.github.com",
        allowedMethods: null,
        allowedPathPrefixes: ["/v1"],
        substitutions: [],
        customHeaders: [],
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.Sse
      })
    ).toEqual(["hostPattern", "allowedMethods", "allowedPathPrefixes", "substitutions"]);
    expect(() => assertServiceFieldsSupported(mcp, { hostPattern: "api.github.com" })).toThrow(
      "An MCP service doesn't take 'hostPattern'."
    );
  });

  test("an HTTP service refuses the MCP-only fields", () => {
    expect(
      findUnsupportedServiceFields(http, {
        hostPattern: "api.github.com",
        allowedMethods: ["GET"],
        substitutions: [],
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.Sse
      })
    ).toEqual(["serverUrl", "transport"]);
    expect(() => assertServiceFieldsSupported(http, { serverUrl: "x", transport: "sse" })).toThrow(
      "An HTTP service doesn't take 'serverUrl' or 'transport'. A server URL and transport apply only to MCP services."
    );
  });

  test("fields left out are not refused", () => {
    expect(findUnsupportedServiceFields(mcp, { hostPattern: undefined, substitutions: undefined })).toEqual([]);
  });
});

describe("fields read back unchanged on an update", () => {
  test("the other type's empty values and an MCP service's derived host pattern count as not sent", () => {
    expect(
      dropReadBackServiceFields(
        mcp,
        { hostPattern: "mcp.linear.app", allowedMethods: null, allowedPathPrefixes: null, substitutions: [] },
        "mcp.linear.app"
      )
    ).toEqual({
      hostPattern: undefined,
      allowedMethods: undefined,
      allowedPathPrefixes: undefined,
      substitutions: undefined
    });
    expect(dropReadBackServiceFields(http, { serverUrl: null, transport: null }, "api.example.com")).toEqual({
      serverUrl: undefined,
      transport: undefined
    });
  });

  test("a real value for a field the type doesn't take is kept, so it is still refused", () => {
    expect(
      dropReadBackServiceFields(mcp, { hostPattern: "other.example.com", substitutions: [{}] }, "mcp.linear.app")
    ).toEqual({ hostPattern: "other.example.com", substitutions: [{}] });
  });

  test("a field the type does take keeps its empty value, which clears it", () => {
    expect(dropReadBackServiceFields(http, { allowedMethods: null, substitutions: [] }, "api.example.com")).toEqual({
      allowedMethods: null,
      substitutions: []
    });
  });
});

describe("credential types", () => {
  test("an MCP service takes a bearer token or OAuth", () => {
    expect(() => assertCredentialTypeSupported(mcp, AgentVaultCredentialType.Bearer)).not.toThrow();
    expect(() => assertCredentialTypeSupported(mcp, AgentVaultCredentialType.OAuth)).not.toThrow();
    expect(() => assertCredentialTypeSupported(mcp, AgentVaultCredentialType.Basic)).toThrow(
      "An MCP service can't use basic auth as its credential. Use a bearer token or OAuth."
    );
    expect(() => assertCredentialTypeSupported(mcp, AgentVaultCredentialType.Passthrough)).toThrow();
  });

  test("an HTTP service takes every credential type but OAuth", () => {
    Object.values(AgentVaultCredentialType)
      .filter((type) => type !== AgentVaultCredentialType.OAuth)
      .forEach((type) => {
        expect(() => assertCredentialTypeSupported(http, type)).not.toThrow();
      });
    expect(() => assertCredentialTypeSupported(http, AgentVaultCredentialType.OAuth)).toThrow(
      "An HTTP service can't use OAuth as its credential."
    );
  });
});
