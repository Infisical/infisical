import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, test } from "vitest";

import { AgentVaultCredentialType, AgentVaultMcpTransport, AgentVaultServiceType } from "./agent-vault-enums";
import { describeNativeTlsCaChange } from "./agent-vault-native-config-schemas";
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
        allowedTools: ["read_file"],
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
        allowedTools: ["read_file"],
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.Sse
      })
    ).toEqual(["allowedTools", "serverUrl", "transport"]);
    expect(() => assertServiceFieldsSupported(http, { serverUrl: "x", transport: "sse" })).toThrow(
      "An HTTP service doesn't take 'serverUrl' or 'transport'. A server URL, transport and allowed tools apply only to MCP services."
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
    expect(
      dropReadBackServiceFields(http, { serverUrl: null, transport: null, allowedTools: null }, "api.example.com")
    ).toEqual({
      serverUrl: undefined,
      transport: undefined,
      allowedTools: undefined
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

  test("an HTTP service takes every credential type but OAuth and an SSH key", () => {
    Object.values(AgentVaultCredentialType)
      .filter((type) => type !== AgentVaultCredentialType.OAuth && type !== AgentVaultCredentialType.SshKey)
      .forEach((type) => {
        expect(() => assertCredentialTypeSupported(http, type)).not.toThrow();
      });
    expect(() => assertCredentialTypeSupported(http, AgentVaultCredentialType.OAuth)).toThrow(
      "An HTTP service can't use OAuth as its credential."
    );
    expect(() => assertCredentialTypeSupported(http, AgentVaultCredentialType.SshKey)).toThrow(
      "An HTTP service can't use an SSH key as its credential."
    );
  });
});

describe("database and SSH services", () => {
  const postgres = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Postgres];
  const mysql = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Mysql];
  const ssh = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Ssh];

  test("fill in the default port and TLS settings", () => {
    expect(buildServiceConfig(postgres, { host: "db.internal", database: "app" })).toEqual({
      host: "db.internal",
      port: 5432,
      database: "app",
      tls: { enabled: true, verify: true }
    });
    expect(buildServiceConfig(mysql, { host: "db.internal", database: "orders" })).toMatchObject({ port: 3306 });
    expect(buildServiceConfig(ssh, { host: "bastion.internal" })).toEqual({ host: "bastion.internal", port: 22 });
  });

  test("have no host pattern, so HTTP matching can never pick them", () => {
    const config = buildServiceConfig(postgres, { host: "db.internal", database: "app" });
    expect(resolveServiceHostPattern(postgres, config, undefined)).toBeNull();
    expect(findUnsupportedServiceFields(postgres, { hostPattern: "db.internal" })).toEqual(["hostPattern"]);
  });

  test("need a database for Postgres and MySQL but not for SSH", () => {
    expect(() => buildServiceConfig(postgres, { host: "db.internal" })).toThrow("'database'");
    expect(() => buildServiceConfig(mysql, { host: "db.internal" })).toThrow("'database'");
    expect(findUnsupportedServiceFields(ssh, { database: "app", tls: { enabled: true } })).toEqual(["database", "tls"]);
  });

  test.each([
    ["postgres://db.internal", "without a scheme"],
    ["db.internal:5432", "Port field"],
    ["*.internal", "Wildcards"],
    ["db.internal/app", "without a path"],
    ["bad host", "isn't a valid host name"]
  ])("refuse the host %s", (host, message) => {
    expect(() => buildServiceConfig(postgres, { host, database: "app" })).toThrow(message);
  });

  test.each(["my_db", "db_1.internal", "_db"])("take the host %s with an underscore", (host) => {
    expect(buildServiceConfig(postgres, { host, database: "app" })).toMatchObject({ host });
  });

  test("refuse a variable in the host or the database name", () => {
    expect(() => buildServiceConfig(postgres, { host: "{{DB_HOST}}", database: "app" })).toThrow(
      "Variables aren't supported in the host yet. Enter the host itself."
    );
    expect(() => buildServiceConfig(mysql, { host: "db.internal", database: "{{DB_NAME}}" })).toThrow(
      "Variables aren't supported in the database name yet. Enter the name itself."
    );
  });

  test("take an IPv6 host with or without brackets", () => {
    expect(buildServiceConfig(ssh, { host: "[2001:db8::1]" })).toMatchObject({ host: "2001:db8::1" });
    expect(buildServiceConfig(ssh, { host: "2001:db8::1" })).toMatchObject({ host: "2001:db8::1" });
  });

  test.each([0, 65536, 1.5])("refuse the port %s", (port) => {
    expect(() => buildServiceConfig(ssh, { host: "bastion.internal", port })).toThrow("'port'");
  });

  test("refuse a certificate authority that isn't a PEM certificate", () => {
    expect(() =>
      buildServiceConfig(postgres, { host: "db.internal", database: "app", tls: { ca: "not a certificate" } })
    ).toThrow("isn't a valid PEM certificate");
  });

  test("keep the stored TLS settings an update leaves out", () => {
    const stored = { host: "db.internal", port: 5432, database: "app", tls: { enabled: true, verify: true } };
    expect(buildServiceConfig(postgres, { tls: { verify: false } }, stored)).toMatchObject({
      tls: { enabled: true, verify: false }
    });
  });

  test("are named with the right article", () => {
    expect(() => assertCredentialTypeSupported(postgres, AgentVaultCredentialType.SshKey)).toThrow(
      "A PostgreSQL service can't use an SSH key as its credential. Use a username and password."
    );
    expect(() => assertServiceFieldsSupported(ssh, { allowedMethods: ["GET"] })).toThrow(
      "An SSH service doesn't take 'allowedMethods'."
    );
  });

  test("an SSH service takes a password or an SSH key", () => {
    expect(() => assertCredentialTypeSupported(ssh, AgentVaultCredentialType.Basic)).not.toThrow();
    expect(() => assertCredentialTypeSupported(ssh, AgentVaultCredentialType.SshKey)).not.toThrow();
    expect(() => assertCredentialTypeSupported(ssh, AgentVaultCredentialType.Bearer)).toThrow();
  });

  test("a read-back of the fields they don't take is not an attempt to set them", () => {
    expect(
      dropReadBackServiceFields(ssh, { hostPattern: null, serverUrl: null, customHeaders: [], database: null }, null)
    ).toEqual({ hostPattern: undefined, serverUrl: undefined, customHeaders: undefined, database: undefined });
  });
});

describe("a database service's text fields", () => {
  const postgres = AGENT_VAULT_SERVICE_TYPES[AgentVaultServiceType.Postgres];
  let certA = "";
  let certB = "";

  beforeAll(async () => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const selfSigned = async (name: string) => {
      const keys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: "01",
        name,
        notBefore: new Date(Date.now() - 86_400_000),
        notAfter: new Date(Date.now() + 86_400_000),
        signingAlgorithm: alg,
        keys
      });
      return cert.toString("pem");
    };
    certA = await selfSigned("CN=Test CA A");
    certB = await selfSigned("CN=Test CA B");
  });

  const withCa = (ca: string) => ({ host: "db.internal", database: "app", tls: { ca } });
  const storedCaOf = (ca: string) => (buildServiceConfig(postgres, withCa(ca)) as { tls: { ca?: string } }).tls.ca;

  test("refuse a database name with a lone surrogate by name rather than failing the write", () => {
    expect(() => buildServiceConfig(postgres, { host: "db.internal", database: "orders\uD800" })).toThrow(
      "'database': The database name contains invalid text."
    );
  });

  test("refuse a certificate authority with a lone surrogate by name", () => {
    expect(() => buildServiceConfig(postgres, withCa(`${certA}\uD800`))).toThrow(
      "'tls.ca': The certificate authority contains invalid text."
    );
  });

  test("refuse a certificate authority pasted with its private key", () => {
    const key =
      "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg\n-----END PRIVATE KEY-----";
    expect(() => buildServiceConfig(postgres, withCa(`${certA}\n${key}`))).toThrow(
      "'tls.ca': Paste only the CA certificate. This text also contains a private key or other data that isn't a certificate."
    );
  });

  test("store two certificates as two blocks", () => {
    expect(storedCaOf(`${certA}\r\n\r\n${certB}`)).toBe(`${certA.trim()}\n${certB.trim()}`);
  });

  test("drop the text around the certificate blocks", () => {
    expect(storedCaOf(`Subject: CN=Test CA A\n${certA}\nIssued for the staging database`)).toBe(certA.trim());
  });
});

describe("the audit's CA change", () => {
  const withCa = (ca?: string) => ({
    host: "db.internal",
    port: 5432,
    database: "app",
    tls: { enabled: true, verify: true, ca }
  });
  const PEM = "-----BEGIN CERTIFICATE-----\nAAAA\nBBBB\n-----END CERTIFICATE-----";

  test.each([
    ["set", withCa(), withCa(PEM)],
    ["removed", withCa(PEM), withCa()],
    ["replaced", withCa(PEM), withCa(PEM.replace("AAAA", "CCCC"))]
  ])("reports %s", (change, stored, next) => {
    expect(describeNativeTlsCaChange(stored, next)).toBe(change);
  });

  test("reports nothing for the same CA pasted with other line endings", () => {
    expect(describeNativeTlsCaChange(withCa(PEM), withCa(PEM.replace(/\n/g, "\r\n")))).toBeUndefined();
    expect(describeNativeTlsCaChange(withCa(), withCa())).toBeUndefined();
  });
});
