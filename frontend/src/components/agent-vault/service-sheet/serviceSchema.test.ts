import { describe, expect, it } from "vitest";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "@app/helpers/agentVaultControlChars";
import { AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE } from "@app/helpers/agentVaultDescription";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  buildServiceSchema,
  certificateAuthorityError,
  credentialLabel,
  isOAuthAuthorizationMissing,
  MAX_ALLOWED_TOOLS,
  McpToolScope,
  nativeDatabaseError,
  nativeHostError,
  newOAuthAuthorizationId,
  OAUTH_CLIENT_VARIABLES_MESSAGE,
  oauthStatusLabel,
  serverUrlError,
  storedOAuthCredential,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

const SERVER_URL = "https://mcp.linear.app/mcp";

const mcpForm = (overrides: Partial<TServiceForm> = {}): TServiceForm => ({
  serviceType: AgentVaultServiceType.Mcp,
  name: "linear-mcp",
  description: "",
  serverUrl: SERVER_URL,
  transport: AgentVaultMcpTransport.StreamableHttp,
  hosts: [],
  host: "",
  port: "",
  database: "",
  tlsEnabled: true,
  tlsVerify: true,
  tlsCa: "",
  sshPrivateKey: "",
  sshCertificate: "",
  sshCertificateRemoved: false,
  hostDraft: "",
  pathDraft: "",
  toolScope: McpToolScope.All,
  allowedTools: [],
  credentialType: AgentVaultCredentialType.OAuth,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "",
  oauthAuthorizationId: "",
  oauthAuthorizedUrl: "",
  oauthScopes: [],
  memberProvidedFields: [],
  methods: [],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: [],
  ...overrides
});

const storedOAuthService = (serverUrl = SERVER_URL) =>
  ({
    id: "service-1",
    accessBundleId: "bundle-1",
    name: "linear-mcp",
    description: null,
    hostPattern: "mcp.linear.app",
    type: AgentVaultServiceType.Mcp,
    serverUrl,
    transport: AgentVaultMcpTransport.StreamableHttp,
    allowedTools: null,
    credential: {
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: [],
      status: AgentVaultOauthStatus.NeedsReauthorization,
      issuer: "https://mcp.linear.app",
      grantedScopes: ["read"],
      requiredScopes: [],
      expiresAt: null,
      authorizedAt: null,
      lastError: null
    },
    customHeaders: [],
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z"
  }) satisfies TAgentVaultService;

describe("serverUrlError", () => {
  it("rejects a query string", () => {
    expect(serverUrlError("https://mcp.example.com/mcp?token=abc")).toMatch(/query string/);
    expect(serverUrlError("https://*.example.com/mcp")).toMatch(/not a wildcard/);
  });

  it("accepts a plain server URL", () => {
    expect(serverUrlError(SERVER_URL)).toBeNull();
  });
});

describe("isOAuthAuthorizationMissing", () => {
  it("requires an authorization for a new OAuth service", () => {
    expect(isOAuthAuthorizationMissing(mcpForm())).toBe(true);
  });

  it("is satisfied by an authorization made for the current server URL", () => {
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
      )
    ).toBe(false);
  });

  it("asks again once the server URL changes after authorizing", () => {
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({
          serverUrl: "https://mcp.notion.com/mcp",
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBe(true);
  });

  it("keeps a stored authorization while the server URL is unchanged", () => {
    expect(isOAuthAuthorizationMissing(mcpForm(), storedOAuthService())).toBe(false);
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({ serverUrl: "https://mcp.linear.app/v2" }),
        storedOAuthService()
      )
    ).toBe(true);
  });

  it("ignores bearer credentials", () => {
    expect(
      isOAuthAuthorizationMissing(mcpForm({ credentialType: AgentVaultCredentialType.Bearer }))
    ).toBe(false);
  });
});

describe("newOAuthAuthorizationId", () => {
  it("returns the authorization made for the current server URL", () => {
    expect(
      newOAuthAuthorizationId(
        mcpForm({
          serverUrl: ` ${SERVER_URL} `,
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBe("auth-1");
  });

  it("drops an authorization made for another server URL", () => {
    expect(
      newOAuthAuthorizationId(
        mcpForm({
          serverUrl: "https://mcp.notion.com/mcp",
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBeUndefined();
  });

  it("returns nothing before authorizing", () => {
    expect(newOAuthAuthorizationId(mcpForm())).toBeUndefined();
  });
});

describe("storedOAuthCredential", () => {
  it("returns the stored credential while the server URL matches", () => {
    const service = storedOAuthService();
    expect(storedOAuthCredential(service, ` ${SERVER_URL} `)).toBe(service.credential);
  });

  it("returns null once the server URL changes", () => {
    expect(storedOAuthCredential(storedOAuthService(), "https://mcp.linear.app/v2")).toBeNull();
  });

  it("returns null for a bearer service or no service", () => {
    const bearer = {
      ...storedOAuthService(),
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer",
        memberProvidedFields: []
      }
    } satisfies TAgentVaultService;
    expect(storedOAuthCredential(bearer, SERVER_URL)).toBeNull();
    expect(storedOAuthCredential(undefined, SERVER_URL)).toBeNull();
  });
});

describe("oauthStatusLabel", () => {
  const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };

  it("labels a new authorization", () => {
    expect(oauthStatusLabel(mcpForm(authorized))).toBe("Authorized");
    expect(oauthStatusLabel(mcpForm(authorized), storedOAuthService())).toBe("Reauthorized");
  });

  it("falls back to the stored status, then to not authorized", () => {
    expect(oauthStatusLabel(mcpForm(), storedOAuthService())).toBe("Needs Reauthorization");
    expect(oauthStatusLabel(mcpForm())).toBe("Not authorized");
  });

  it("calls a working stored authorization Authorized, the word the card uses", () => {
    const service = storedOAuthService();
    const working = {
      ...service,
      credential: { ...service.credential, status: AgentVaultOauthStatus.Connected }
    } as TAgentVaultService;
    expect(oauthStatusLabel(mcpForm(), working)).toBe("Authorized");
  });
});

describe("buildServiceSchema with OAuth", () => {
  it("blocks an unauthorized OAuth service on the authorization field only", () => {
    const result = buildServiceSchema().safeParse(mcpForm());
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
    expect(paths).toEqual(["oauthAuthorizationId"]);
  });

  it("accepts an authorized OAuth service without a token", () => {
    const result = buildServiceSchema().safeParse(
      mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
    );
    expect(result.success).toBe(true);
  });

  it("validates manual client credentials in the service form", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({ oauthClientId: "x".repeat(2049), oauthClientSecret: "x".repeat(4097) })
    );
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "oauthClientId",
      "oauthClientSecret"
    ]);
  });

  it("refuses a variable reference in the client ID or secret, which are sent as typed", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({
        oauthClientId: "{{GITHUB_CLIENT_ID}}",
        oauthClientSecret: "{{GITHUB_CLIENT_SECRET}}"
      })
    );
    expect(result.error?.issues.map(({ path, message }) => [path.join("."), message])).toEqual([
      ["oauthClientId", OAUTH_CLIENT_VARIABLES_MESSAGE],
      ["oauthClientSecret", OAUTH_CLIENT_VARIABLES_MESSAGE]
    ]);
  });

  it("refuses a client ID or secret the API would refuse, such as one with a pasted smart quote", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({ oauthClientId: "\u201cclient-1\u201d", oauthClientSecret: "line\nbreak" })
    );
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "oauthClientId",
      "oauthClientSecret"
    ]);
  });

  it("ignores leftover client values once the service switches to a bearer token", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({
        credentialType: AgentVaultCredentialType.Bearer,
        secret: "token",
        oauthClientId: "{{GITHUB_CLIENT_ID}}",
        oauthClientSecret: "\u201csecret\u201d"
      })
    );
    expect(result.success).toBe(true);
  });

  it("refuses to save an existing service whose new authorization expired, until it is reauthorized or kept", () => {
    const schema = buildServiceSchema(storedOAuthService());
    const expired = schema.safeParse(
      mcpForm({
        oauthAuthorizationRejection: "This authorization expired before the service was saved."
      })
    );
    expect(expired.error?.issues.map(({ path, message }) => [path.join("."), message])).toEqual([
      ["oauthAuthorizationId", "This authorization expired before the service was saved."]
    ]);

    expect(schema.safeParse(mcpForm({ oauthAuthorizationRejection: "" })).success).toBe(true);
    expect(
      schema.safeParse(
        mcpForm({
          oauthAuthorizationRejection: "This authorization expired before the service was saved.",
          oauthAuthorizationId: "auth-2",
          oauthAuthorizedUrl: SERVER_URL
        })
      ).success
    ).toBe(true);
  });

  it("ignores the bearer header fields and reserves Authorization for the token", () => {
    const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };
    expect(
      buildServiceSchema().safeParse(mcpForm({ ...authorized, headerName: "Host" })).success
    ).toBe(true);
    expect(
      buildServiceSchema().safeParse(
        mcpForm({ ...authorized, headerName: "X Api Key", headerPrefix: "p".repeat(65) })
      ).success
    ).toBe(true);
    const bearer = buildServiceSchema().safeParse(
      mcpForm({
        credentialType: AgentVaultCredentialType.Bearer,
        secret: "token",
        headerName: "X Api Key",
        headerPrefix: "p".repeat(65)
      })
    );
    expect(bearer.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "headerName",
      "headerPrefix"
    ]);
    const clash = buildServiceSchema().safeParse(
      mcpForm({
        ...authorized,
        headerName: "X-Api-Key",
        customHeaders: [{ name: "Authorization", prefix: "", value: "v" }]
      })
    );
    expect(clash.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "customHeaders.0.name"
    ]);
  });
});

describe("buildServiceSchema with allowed tools", () => {
  const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };
  const toolIssues = (overrides: Partial<TServiceForm>) =>
    buildServiceSchema()
      .safeParse(mcpForm({ ...authorized, toolScope: McpToolScope.Selected, ...overrides }))
      .error?.issues.map(({ path, message }) => [path.join("."), message]) ?? [];

  it("accepts all tools with nothing selected, and keeps picks made before switching to all", () => {
    expect(buildServiceSchema().safeParse(mcpForm(authorized)).success).toBe(true);
    expect(
      buildServiceSchema().safeParse(mcpForm({ ...authorized, allowedTools: [" bad name"] }))
        .success
    ).toBe(true);
  });

  it("accepts names in the MCP spec's characters, case-sensitive", () => {
    expect(
      toolIssues({
        allowedTools: ["read_file", "Read_File", "issues.create-v2"]
      })
    ).toEqual([]);
  });

  it("requires at least one selected tool", () => {
    expect(toolIssues({ allowedTools: [] })).toEqual([
      ["allowedTools", "Select at least one tool, or turn on All Tools."]
    ]);
  });

  it("refuses names outside the MCP spec's characters, names over 128 characters, and duplicates", () => {
    expect(
      toolIssues({
        allowedTools: [" read_file", "a".repeat(129), "read\u0000file", "ns:tool", "ok", "ok"]
      }).map(([path]) => path)
    ).toEqual(["allowedTools", "allowedTools", "allowedTools", "allowedTools", "allowedTools"]);
    expect(toolIssues({ allowedTools: ["read file"] })).toEqual([
      [
        "allowedTools",
        '"read file": A tool name can only contain letters, numbers, underscores (_), hyphens (-), and dots (.).'
      ]
    ]);
    expect(toolIssues({ allowedTools: ["Tool-v2.beta_1"] })).toEqual([]);
    expect(toolIssues({ allowedTools: ["ok", "ok"] })).toEqual([
      ["allowedTools", '"ok" is listed twice.']
    ]);
    expect(toolIssues({ allowedTools: ["a".repeat(128)] })).toEqual([]);
  });

  it("caps the list at the API's limit", () => {
    const names = (count: number) => Array.from({ length: count }, (_, index) => `tool_${index}`);
    expect(toolIssues({ allowedTools: names(MAX_ALLOWED_TOOLS) })).toEqual([]);
    expect(toolIssues({ allowedTools: names(MAX_ALLOWED_TOOLS + 1) })).toEqual([
      ["allowedTools", `You can select at most ${MAX_ALLOWED_TOOLS} tools.`]
    ]);
  });
});

const nativeForm = (overrides: Partial<TServiceForm> = {}): TServiceForm =>
  mcpForm({
    serviceType: AgentVaultServiceType.Mysql,
    name: "orders-db",
    serverUrl: "",
    host: "db.internal",
    port: "3306",
    database: "orders",
    credentialType: AgentVaultCredentialType.Basic,
    username: "agent",
    ...overrides
  });

const issuesOf = (form: TServiceForm) => {
  const result = buildServiceSchema().safeParse(form);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("buildServiceSchema with a database or SSH service", () => {
  it("accepts a database service without a password", () => {
    expect(issuesOf(nativeForm())).toEqual([]);
  });

  it("asks for a username unless members set it", () => {
    expect(issuesOf(nativeForm({ username: "", secret: "pw" }))).toEqual(["username"]);
    expect(
      issuesOf(
        nativeForm({
          username: "",
          memberProvidedFields: [AgentVaultVariableReferenceField.CredentialUsername]
        })
      )
    ).toEqual([]);
  });

  it("refuses a port in the host and a port out of range", () => {
    expect(issuesOf(nativeForm({ host: "db.internal:3306", port: "70000" }))).toEqual([
      "host",
      "port"
    ]);
  });

  it("accepts an IPv6 host", () => {
    expect(issuesOf(nativeForm({ host: "fd00::1" }))).toEqual([]);
  });

  it("asks for an SSH key's username and private key, and refuses variables in them", () => {
    const ssh = { serviceType: AgentVaultServiceType.Ssh, database: "", port: "22" };
    expect(
      issuesOf(
        nativeForm({
          ...ssh,
          credentialType: AgentVaultCredentialType.SshKey,
          username: "",
          sshPrivateKey: ""
        })
      )
    ).toEqual(["username", "sshPrivateKey"]);
    expect(
      issuesOf(
        nativeForm({
          ...ssh,
          credentialType: AgentVaultCredentialType.SshKey,
          username: "{{SSH_USER}}",
          sshPrivateKey: "key"
        })
      )
    ).toEqual(["username"]);
  });

  it("refuses an SSH key for a database service", () => {
    expect(
      issuesOf(
        nativeForm({ credentialType: AgentVaultCredentialType.SshKey, sshPrivateKey: "key" })
      )
    ).toContain("credentialType");
  });
});

const TEST_CA = `-----BEGIN CERTIFICATE-----
MIIBVzCB/qADAgECAhQ9pI7tr24PnR5MqOJ8osqFHdDDXDAKBggqhkjOPQQDAjAS
MRAwDgYDVQQDDAd0ZXN0LWNhMB4XDTI2MTEwNjIzMzQ1M1oXDTM2MTEwMzIzMzQ1
M1owEjEQMA4GA1UEAwwHdGVzdC1jYTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IA
BI8uAZDH1u6uZ328I+7btg5fQ5ZnjOZjLD2snYwdo2VLo9np+Q7krzk0yZpHGvBc
y97GixpvWHFxxao6pax7jcWjMjAwMB0GA1UdDgQWBBQVFYoGRGRlZ4/CN/z5MSpw
m6vnMTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCICdfpO1XCFqQ
WA+1sWlXd7ldriRKlXd1JDYUpvWV/NU4AiEAlzyBy0Tu2alxzI+D9KCEXd6Mm3gI
WiB0v7UEiIl2WqA=
-----END CERTIFICATE-----`;

const messageOf = (form: TServiceForm, path: string) => {
  const result = buildServiceSchema().safeParse(form);
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path.join(".") === path)?.message;
};

describe("nativeHostError, which mirrors the API's host rule", () => {
  it("accepts host names, underscores in a label, IPv4, IPv6 and a bracketed IPv6", () => {
    [
      "db.internal",
      "my_db",
      "orders_db.svc.cluster.local",
      "DB.Internal.",
      "10.0.0.5",
      "fd00::1",
      "[fd00::1]"
    ].forEach((host) => expect(nativeHostError(host)).toBeNull());
  });

  it("refuses what the API refuses, with its message", () => {
    expect(nativeHostError("")).toBe("Enter the server's host name or IP address.");
    expect(nativeHostError("a".repeat(254))).toBe("The host can be at most 253 characters.");
    expect(nativeHostError("db host")).toBe("The host can't contain spaces or control characters.");
    expect(nativeHostError("db\u0007x")).toBe(
      "The host can't contain spaces or control characters."
    );
    expect(nativeHostError("postgres://db")).toBe(
      "Enter only the host, without a scheme such as postgres://."
    );
    expect(nativeHostError("db/orders")).toBe("Enter only the host, without a path.");
    expect(nativeHostError("*.internal")).toBe(
      "Enter one specific host. Wildcards aren't supported here."
    );
    expect(nativeHostError("db:5432")).toBe(
      "Enter the port in the Port field, not as part of the host."
    );
    expect(nativeHostError("db!x")).toBe('"db!x" isn\'t a valid host name or IP address.');
    expect(nativeHostError("-db")).toBe('"-db" isn\'t a valid host name or IP address.');
    expect(nativeHostError("{{DB_HOST}}")).toBe(
      "Variables aren't supported in the host yet. Enter the host itself."
    );
  });
});

describe("nativeDatabaseError", () => {
  it("refuses an empty, long, templated or control-character name", () => {
    expect(nativeDatabaseError(" orders ")).toBeNull();
    expect(nativeDatabaseError(" ")).toBe("Enter the database to connect to.");
    expect(nativeDatabaseError("a".repeat(65))).toBe(
      "The database name can be at most 64 characters."
    );
    expect(nativeDatabaseError("{{DB}}")).toBe(
      "Variables aren't supported in the database name yet. Enter the name itself."
    );
    expect(nativeDatabaseError("orders\tx")).toBe(
      "The database name can't contain control characters."
    );
  });
});

describe("certificateAuthorityError", () => {
  const invalid =
    "The certificate authority isn't a valid PEM certificate. Paste the CA certificate, starting with -----BEGIN CERTIFICATE-----.";

  it("accepts nothing, one certificate, or a bundle", () => {
    expect(certificateAuthorityError("")).toBeNull();
    expect(certificateAuthorityError(TEST_CA)).toBeNull();
    expect(certificateAuthorityError(`${TEST_CA}\n${TEST_CA}\n`)).toBeNull();
  });

  it("refuses text without a certificate and a certificate whose body is corrupt", () => {
    expect(certificateAuthorityError("not a certificate")).toBe(invalid);
    expect(certificateAuthorityError(TEST_CA.replace("MIIBVzCB", "MIIBVzXX"))).toBe(invalid);
    expect(certificateAuthorityError(`${TEST_CA}\u0000`)).toBe(invalid);
  });

  it("accepts a certificate pasted with Windows line endings", () => {
    expect(certificateAuthorityError(TEST_CA.replace(/\n/g, "\r\n"))).toBeNull();
  });

  it("refuses a certificate pasted together with its private key", () => {
    expect(
      certificateAuthorityError(
        `${TEST_CA}\n-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg\n-----END PRIVATE KEY-----\n`
      )
    ).toBe(
      "Paste only the CA certificate. This text also contains a private key or other data that isn't a certificate."
    );
  });
});

describe("buildServiceSchema with native validation", () => {
  it("marks a corrupt CA on its field only while the certificate is verified", () => {
    const corrupt = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";
    expect(issuesOf(nativeForm({ tlsCa: corrupt }))).toEqual(["tlsCa"]);
    expect(issuesOf(nativeForm({ tlsCa: corrupt, tlsEnabled: false }))).toEqual([]);
    expect(issuesOf(nativeForm({ tlsCa: corrupt, tlsVerify: false }))).toEqual([]);
  });

  it("marks a templated host and database on their fields", () => {
    expect(issuesOf(nativeForm({ host: "{{HOST}}", database: "{{DB}}" }))).toEqual([
      "host",
      "database"
    ]);
  });

  const sshKey = (overrides: Partial<TServiceForm>) =>
    nativeForm({
      serviceType: AgentVaultServiceType.Ssh,
      database: "",
      port: "22",
      credentialType: AgentVaultCredentialType.SshKey,
      username: "deploy",
      sshPrivateKey: "key",
      ...overrides
    });

  it("caps an SSH key at the API's 8192 characters", () => {
    expect(issuesOf(sshKey({ sshPrivateKey: "k".repeat(8192) }))).toEqual([]);
    expect(messageOf(sshKey({ sshPrivateKey: "k".repeat(8193) }), "sshPrivateKey")).toBe(
      "This can be at most 8192 characters."
    );
  });

  it("refuses a tab or line break in an SSH key's username, which a key may contain", () => {
    expect(issuesOf(sshKey({ username: "de\tploy" }))).toEqual(["username"]);
    expect(issuesOf(sshKey({ sshPrivateKey: "line one\n\tline two" }))).toEqual([]);
  });

  it("skips a stored certificate that is being removed", () => {
    expect(issuesOf(sshKey({ sshCertificate: "{{CERT}}", sshCertificateRemoved: true }))).toEqual(
      []
    );
    expect(issuesOf(sshKey({ sshCertificate: UNCHANGED_SECRET }))).toEqual([]);
  });
});

describe("credentialLabel", () => {
  it("calls an SSH password login Password, as the picker does", () => {
    expect(credentialLabel(AgentVaultServiceType.Ssh, AgentVaultCredentialType.Basic)).toBe(
      "Password"
    );
    expect(credentialLabel(AgentVaultServiceType.Postgres, AgentVaultCredentialType.Basic)).toBe(
      "Username and Password"
    );
    expect(credentialLabel(AgentVaultServiceType.Http, AgentVaultCredentialType.Basic)).toBe(
      "Basic Auth"
    );
  });
});

describe("buildServiceSchema with a description", () => {
  const descriptionIssues = (description: string) =>
    (
      buildServiceSchema().safeParse(
        mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL, description })
      ).error?.issues ?? []
    )
      .filter((issue) => issue.path.join(".") === "description")
      .map((issue) => issue.message);

  it("is optional, and refuses what the API refuses with the API's message", () => {
    expect(descriptionIssues("")).toEqual([]);
    expect(descriptionIssues("Issues for the platform team")).toEqual([]);
    expect(descriptionIssues("x".repeat(257))).toEqual([
      "A description can be at most 256 characters"
    ]);
    expect(descriptionIssues("line\nbreak")).toEqual([AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE]);
    expect(descriptionIssues("Issues\u200Bfor the platform team")).toEqual([
      AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
    ]);
    expect(descriptionIssues("Deploys \u202Eto production")).toEqual([
      AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
    ]);
    expect(descriptionIssues("Tags \u{E0041}hidden")).toEqual([
      AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
    ]);
    // Joiners are real text, in emoji sequences and several scripts.
    expect(descriptionIssues("Family \u{1F468}\u200D\u{1F469}\u200D\u{1F467} tickets")).toEqual([]);
  });
});
