import { describe, expect, test } from "vitest";

import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField
} from "../agent-vault/agent-vault-enums";
import { TResolveServiceRow } from "./agent-vault-resolve-dal";
import {
  buildSessionServicesDocument,
  describeSessionService,
  toBundleServiceFacts,
  toSetPersonalFields,
  TSessionServiceFacts
} from "./agent-vault-session-services-fns";

const facts = (overrides: Partial<TSessionServiceFacts> = {}): TSessionServiceFacts => ({
  name: "github",
  description: "GitHub REST API for the acme-corp organization.",
  type: AgentVaultServiceType.Http,
  hostPattern: "api.github.com",
  serverUrl: null,
  transport: null,
  allowedMethods: null,
  allowedPathPrefixes: null,
  allowedTools: null,
  credential: { type: "bearer", headerName: null },
  customHeaderNames: [],
  substitutions: [],
  personalValuesMissing: false,
  memberProvided: false,
  memberSignsIn: false,
  ...overrides
});

describe("describing one service", () => {
  test("a bearer service with one host says to call its URL and that the proxy sets the header", () => {
    const described = describeSessionService(facts({ allowedMethods: ["get"] }));
    expect(described).toMatchObject({
      name: "github",
      type: "http",
      hosts: ["api.github.com"],
      url: "https://api.github.com",
      status: "ready",
      credential: { type: "bearer", header: "Authorization", addedByProxy: true, memberProvided: false },
      allowedMethods: ["GET"]
    });
    expect(described).not.toHaveProperty("transport");
    expect(described.howToUse).toBe(
      "Call https://api.github.com directly. The proxy sets the Authorization header, so send no key, or any placeholder value if a client or SDK insists on one. A key you send in that header is replaced. Only GET requests are allowed; the proxy refuses any other method."
    );
  });

  test("names the header a bearer credential goes in, and says Authorization for OAuth and basic", () => {
    expect(
      describeSessionService(facts({ credential: { type: "bearer", headerName: "x-api-key" } })).credential
    ).toEqual({
      type: "bearer",
      header: "x-api-key",
      addedByProxy: true,
      memberProvided: false
    });
    expect(describeSessionService(facts({ credential: { type: "oauth" } })).credential).toEqual({
      type: "oauth",
      header: "Authorization",
      addedByProxy: true,
      memberProvided: false
    });
    const basic = describeSessionService(facts({ credential: { type: "basic" } }));
    expect(basic.credential).toEqual({
      type: "basic",
      header: "Authorization",
      addedByProxy: true,
      memberProvided: false
    });
    expect(basic.howToUse).toBe(
      "Call https://api.github.com directly. The proxy sets HTTP Basic auth, so send no credentials, or any placeholder username and password."
    );
  });

  test("a service the proxy adds nothing to says so, unless it substitutes placeholders", () => {
    expect(describeSessionService(facts({ credential: { type: "none" } })).howToUse).toBe(
      "Call https://api.github.com directly. The proxy adds no credential to requests for this service."
    );
    const substituted = describeSessionService(
      facts({
        hostPattern: "api.telegram.org",
        credential: { type: "none" },
        substitutions: [
          { placeholder: "__TOKEN__", surfaces: ["body", "path"] },
          { placeholder: "__TOKEN_SECONDARY__", surfaces: ["header"] }
        ]
      })
    );
    expect(substituted.credential).toEqual({ type: "none", addedByProxy: false, memberProvided: false });
    expect(substituted.placeholders).toEqual([
      { placeholder: "__TOKEN_SECONDARY__", surfaces: ["header"] },
      { placeholder: "__TOKEN__", surfaces: ["path", "body"] }
    ]);
    expect(substituted.howToUse).toBe(
      'Call https://api.telegram.org directly. Write "__TOKEN_SECONDARY__" exactly where the secret goes (in the header): the proxy replaces it with the real value. Any other value is sent unchanged. Write "__TOKEN__" exactly where the secret goes (in the path or body): the proxy replaces it with the real value. Any other value is sent unchanged.'
    );
  });

  test("a credential that is the session owner's own says that they, not an admin, fix a rejection", () => {
    const own = describeSessionService(facts({ memberProvided: true }));
    expect(own.credential).toEqual({
      type: "bearer",
      header: "Authorization",
      addedByProxy: true,
      memberProvided: true
    });
    expect(own.howToUse).toContain(
      "The credential is the session owner's own. If the service rejects it with 401 or 403, they have to update their personal value for \"github\" in Agent Vault, which an admin can't do for them."
    );
    expect(describeSessionService(facts()).howToUse).not.toContain("session owner");
  });

  test("on a user's behalf, names that user as the one who sets or fixes a personal value", () => {
    expect(describeSessionService(facts({ memberProvided: true }), true).howToUse).toContain(
      'The credential is the personal value of the user this session is for. If the service rejects it with 401 or 403, that user has to update their personal value for "github" in Agent Vault, which an admin can\'t do for them.'
    );
    expect(
      describeSessionService(facts({ memberProvided: true, credential: { type: "oauth" } }), true).howToUse
    ).toContain(
      'The credential is the sign-in of the user this session is for. If the server rejects it, that user has to reconnect their account for "github" in Agent Vault, which an admin can\'t do for them.'
    );
    expect(describeSessionService(facts({ personalValuesMissing: true, memberProvided: true }), true).howToUse).toBe(
      'Not usable yet: the user this session is for has to set their personal values for "github" in Agent Vault. The proxy refuses requests to it until then, and it can take a few minutes to apply.'
    );
    // A sign-in that expired needs connecting again, which "set their personal values" wouldn't say.
    expect(
      describeSessionService(facts({ personalValuesMissing: true, memberProvided: true, memberSignsIn: true })).howToUse
    ).toBe(
      'Not usable yet: the session\'s owner has to connect their account for "github" in Agent Vault. The proxy refuses requests to it until then, and it can take a few minutes to apply.'
    );
    const document = buildSessionServicesDocument({
      proxy: null,
      session: { expiresAt: null, accessBundle: "engineering", onBehalfOfUser: true },
      services: [facts({ memberProvided: true })]
    });
    expect(document.services[0].howToUse).toContain("the user this session is for");
    expect(
      document.notes.some((note) =>
        note.includes("or the user this session is for when the service's credential is memberProvided")
      )
    ).toBe(true);
  });

  test("a service waiting for personal values says it isn't usable yet and offers no credential", () => {
    const described = describeSessionService(facts({ personalValuesMissing: true, memberProvided: true }));
    expect(described.status).toBe("needs-personal-values");
    expect(described.credential).toEqual({ type: "none", addedByProxy: false, memberProvided: true });
    expect(described.howToUse).toBe(
      'Not usable yet: the session\'s owner has to set their personal values for "github" in Agent Vault. The proxy refuses requests to it until then, and it can take a few minutes to apply.'
    );
  });

  test("an MCP service gives its server URL and transport, and its allowed tools in order", () => {
    const described = describeSessionService(
      facts({
        name: "linear",
        type: AgentVaultServiceType.Mcp,
        hostPattern: "mcp.linear.app",
        serverUrl: "https://mcp.linear.app/sse",
        transport: "sse",
        credential: { type: "oauth" },
        allowedTools: ["update_issue", "list_issues", "list_issues"]
      })
    );
    expect(described).toMatchObject({
      type: "mcp",
      url: "https://mcp.linear.app/sse",
      transport: "sse",
      allowedTools: ["list_issues", "update_issue"]
    });
    expect(described.howToUse).toBe(
      "Remote MCP server (sse transport). Connect to https://mcp.linear.app/sse with no credential and no OAuth sign-in: the proxy adds the credential. A client that only loads MCP servers at startup will not see a server added now, so in this session open a GET request to https://mcp.linear.app/sse with Accept: text/event-stream and keep reading it. Its first event, named endpoint, gives the URL to POST JSON-RPC messages to, and every response arrives on that stream rather than in the reply to the POST (call initialize, send the notifications/initialized notification, then call tools/list and tools/call). Only these tools can be called: list_issues, update_issue."
    );
  });

  test("a streamable HTTP MCP server is called with POSTs, initialized before its tools are listed", () => {
    const described = describeSessionService(
      facts({
        name: "linear",
        type: AgentVaultServiceType.Mcp,
        hostPattern: "mcp.linear.app",
        serverUrl: "https://mcp.linear.app/mcp",
        transport: null,
        credential: { type: "oauth" }
      })
    );
    expect(described.howToUse).toBe(
      "Remote MCP server (streamable-http transport). Connect to https://mcp.linear.app/mcp with no credential and no OAuth sign-in: the proxy adds the credential. A client that only loads MCP servers at startup will not see a server added now, so in this session call it with JSON-RPC over HTTPS POST to https://mcp.linear.app/mcp (send Content-Type: application/json and Accept: application/json, text/event-stream; call initialize, send the notifications/initialized notification, then call tools/list and tools/call; on every request after initialize, send back any Mcp-Session-Id header it returns and an MCP-Protocol-Version header with the protocolVersion from its initialize result)."
    );
  });

  test("offers a URL only for one host that isn't a wildcard, with the scheme its port implies", () => {
    const urlFor = (hostPattern: string) => describeSessionService(facts({ hostPattern })).url;
    expect(urlFor("*.github.com")).toBeNull();
    expect(urlFor("api.github.com, uploads.github.com")).toBeNull();
    expect(urlFor("api.example.com:80")).toBe("http://api.example.com");
    expect(urlFor("api.example.com:8443")).toBe("https://api.example.com:8443");
    expect(urlFor("api.example.com.")).toBe("https://api.example.com");
    expect(urlFor("[::1]:8443")).toBe("https://[::1]:8443");
    expect(describeSessionService(facts({ hostPattern: "a.example.com, b.example.com" })).hosts).toEqual([
      "a.example.com",
      "b.example.com"
    ]);
  });

  test("lists custom header names, path prefixes and each method once, upper-cased", () => {
    const described = describeSessionService(
      facts({
        customHeaderNames: ["X-Org", "X-Team"],
        allowedMethods: [" get", "POST", "get"],
        allowedPathPrefixes: ["/repos", "/user"]
      })
    );
    expect(described.allowedMethods).toEqual(["GET", "POST"]);
    expect(described.howToUse).toContain("The proxy also sets X-Org, X-Team.");
    expect(described.howToUse).toContain("Only paths starting with /repos, /user are allowed.");
  });
});

describe("the whole list", () => {
  const expiresAt = new Date("2026-11-05T02:00:00.123Z");

  test("describes the proxy it came through and that proxy's traffic policy", () => {
    const document = buildSessionServicesDocument({
      proxy: {
        name: "prod-proxy",
        version: "0.44.0",
        trafficPolicy: AgentVaultTrafficPolicy.BundleHosts,
        allowedHosts: null
      },
      session: { expiresAt, accessBundle: "engineering", onBehalfOfUser: false },
      services: [facts()]
    });
    expect(document.agentVault).toEqual({ proxy: "prod-proxy", version: "0.44.0", trafficPolicy: "service-hosts" });
    // No label: someone's summary of the session could steer an agent away from its prompt.
    expect(document.session).toEqual({ expiresAt: "2026-11-05T02:00:00Z", accessBundle: "engineering" });
    expect(document.notes).toContain("This proxy refuses requests to hosts no service covers.");
    expect(document.notes).toContain(
      "The session expires at 2026-11-05T02:00:00Z; after that the proxy refuses every request."
    );
    expect(
      document.notes.some((note) =>
        note.includes("or the session's owner when the service's credential is memberProvided")
      )
    ).toBe(true);
  });

  test("under any-host, says hosts no service covers are reachable", () => {
    const document = buildSessionServicesDocument({
      proxy: { name: "dev-proxy", version: null, trafficPolicy: AgentVaultTrafficPolicy.AnyHost, allowedHosts: null },
      session: { expiresAt: null, accessBundle: "skills-only", onBehalfOfUser: false },
      services: []
    });
    expect(document.agentVault.trafficPolicy).toBe("any-host");
    // A bundle with no services, only skills, is still the session's bundle.
    expect(document.session.accessBundle).toBe("skills-only");
    expect(document.notes).toContain(
      "Hosts no service covers are reachable, but the proxy adds nothing to those requests."
    );
    expect(document.notes.some((note) => note.startsWith("The session expires"))).toBe(false);
  });

  test("under service-hosts, names the hosts an admin made exceptions, up to a limit", () => {
    const list = (allowedHosts: string) =>
      buildSessionServicesDocument({
        proxy: { name: "prod-proxy", version: null, trafficPolicy: AgentVaultTrafficPolicy.BundleHosts, allowedHosts },
        session: { expiresAt: null, accessBundle: "engineering", onBehalfOfUser: false },
        services: []
      }).notes;
    expect(list("pypi.org, files.pythonhosted.org")).toContain(
      "This proxy refuses requests to hosts no service covers, except these, which an admin allowed: pypi.org, files.pythonhosted.org. The proxy adds no credential to requests to them."
    );
    const many = Array.from({ length: 30 }, (_, index) => `host${index}.example.com`).join(",");
    const note = list(many).find((text) => text.startsWith("This proxy refuses"))!;
    expect(note).toContain("host24.example.com and 5 more.");
    expect(note).not.toContain("host25.example.com");
  });

  test("without a proxy, leaves the traffic policy out instead of guessing it", () => {
    const document = buildSessionServicesDocument({
      proxy: null,
      session: { expiresAt: null, accessBundle: null, onBehalfOfUser: false },
      services: [facts()]
    });
    expect(document.agentVault).toEqual({ proxy: null, version: null, trafficPolicy: null });
    expect(document.session).toEqual({ expiresAt: null, accessBundle: null });
    expect(document.notes.some((note) => note.includes("hosts no service covers"))).toBe(false);
  });
});

describe("a bundle service's facts", () => {
  const row = (overrides: Partial<TResolveServiceRow> = {}): TResolveServiceRow => ({
    id: "service-1",
    name: "github",
    description: null,
    accessBundleName: "engineering",
    type: AgentVaultServiceType.Http,
    hostPattern: "api.github.com",
    config: {},
    credentialType: AgentVaultCredentialType.Bearer,
    credentialConfig: { headerName: "Authorization", headerPrefix: "Bearer " },
    encryptedCredential: Buffer.from("sealed"),
    allowedMethods: null,
    allowedPathPrefixes: null,
    allowedTools: null,
    memberProvidedFields: null,
    position: 0,
    ...overrides
  });
  const context = (setPersonalFields: string[] = []) => ({
    customHeaderNames: [],
    substitutions: [],
    setPersonalFields: new Set(setPersonalFields)
  });

  test("a stored credential counts, and a service with nothing stored adds nothing", () => {
    expect(toBundleServiceFacts(row(), context()).credential).toEqual({ type: "bearer", headerName: "Authorization" });
    expect(toBundleServiceFacts(row({ encryptedCredential: null }), context()).credential).toEqual({ type: "none" });
    expect(
      toBundleServiceFacts(row({ credentialType: AgentVaultCredentialType.Passthrough }), context()).credential
    ).toEqual({ type: "none" });
    expect(
      toBundleServiceFacts(
        row({ credentialType: AgentVaultCredentialType.OAuth, encryptedCredential: null }),
        context()
      ).credential
    ).toEqual({ type: "none" });
  });

  test("a field left to members counts only once the member has set every one of them", () => {
    const memberRow = row({
      encryptedCredential: null,
      memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue]
    });
    const missing = toBundleServiceFacts(memberRow, context());
    expect(missing.personalValuesMissing).toBe(true);
    expect(missing.credential).toEqual({ type: "none" });

    const set = toBundleServiceFacts(memberRow, context([AgentVaultVariableReferenceField.CredentialValue]));
    expect(set.personalValuesMissing).toBe(false);
    expect(set.credential).toEqual({ type: "bearer", headerName: "Authorization" });
  });

  describe("a service whose members sign in with OAuth", () => {
    const SERVER_URL = "https://mcp.linear.app/mcp";
    // Registered dynamically, so the row seals nothing, not even a client secret.
    const signInRow = row({
      type: AgentVaultServiceType.Mcp,
      hostPattern: "mcp.linear.app",
      config: { serverUrl: SERVER_URL, transport: "streamable-http" },
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: "oauth", serverUrl: SERVER_URL, registration: "dynamic" },
      encryptedCredential: null,
      memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue]
    });
    const connection = (oauthConfig: Record<string, unknown> | null) => ({
      serviceId: "service-1",
      field: AgentVaultVariableReferenceField.CredentialValue,
      oauthConfig: oauthConfig && { serverUrl: SERVER_URL, status: AgentVaultOauthStatus.Connected, ...oauthConfig }
    });
    const factsWith = (personalValueRow?: ReturnType<typeof connection>) =>
      toBundleServiceFacts(signInRow, {
        ...context(),
        setPersonalFields:
          toSetPersonalFields([signInRow], personalValueRow ? [personalValueRow] : []).get("service-1") ??
          new Set<string>()
      });

    test("is ready with the member's OAuth token once they are signed in", () => {
      const signedIn = factsWith(connection({}));
      expect(signedIn.personalValuesMissing).toBe(false);
      expect(signedIn.credential).toEqual({ type: "oauth" });
      const described = describeSessionService(signedIn);
      expect(described.credential).toEqual({
        type: "oauth",
        header: "Authorization",
        addedByProxy: true,
        memberProvided: true
      });
      expect(described.howToUse).toContain(
        "The credential is the session owner's own sign-in. If the server rejects it, they have to reconnect their account for \"github\" in Agent Vault, which an admin can't do for them."
      );
    });

    test("waits for the member while resolve would refuse their sign-in", () => {
      [
        undefined,
        connection({ status: AgentVaultOauthStatus.NeedsReauthorization }),
        connection({ serverUrl: "https://old.example.com/mcp" }),
        // A typed value saved before the service left sign-in to members is never sent as a token.
        connection(null)
      ].forEach((personalValueRow) => {
        const waiting = factsWith(personalValueRow);
        expect(waiting.personalValuesMissing).toBe(true);
        expect(describeSessionService(waiting)).toMatchObject({
          status: "needs-personal-values",
          credential: { type: "none", addedByProxy: false, memberProvided: true }
        });
      });
    });

    test("a sign-in never counts as a typed value on a service that takes one", () => {
      const typedRow = row({ memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue] });
      expect(toSetPersonalFields([typedRow], [connection({})]).has("service-1")).toBe(false);
      expect(toSetPersonalFields([typedRow], [connection(null)]).get("service-1")).toEqual(
        new Set([AgentVaultVariableReferenceField.CredentialValue])
      );
    });
  });
});
