import { createMcpHandler } from "@modelcontextprotocol/server";

import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpServer } from "./mcp-server";

vi.mock("@app/lib/request-context/oauth-delegation", () => ({ isScopeNarrowedRequest: () => true }));

type TJsonSchema = { description?: string; properties?: Record<string, TJsonSchema> };
type TToolResult = { isError?: boolean; content: { text: string }[] };

// Only the services a test passes, plus audit logs and analytics, exist, so a tool that reaches any other fails.
const callMcp = async <T>(
  scopes: OauthScope[],
  method: string,
  params?: Record<string, unknown>,
  services: Record<string, unknown> = {}
) => {
  const server = {
    services: {
      auditLog: {
        recordPermissionDenied: vi.fn().mockResolvedValue(undefined),
        createAuditLog: vi.fn().mockResolvedValue(undefined)
      },
      telemetry: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) },
      orgPermissionService: { getOrgPermission: vi.fn().mockResolvedValue({}) },
      ...services
    }
  };
  const req = {
    method: "POST",
    actor: { type: "user", id: "user-id", orgId: "org-id", authMethod: null },
    auth: { actor: "user", user: { username: "user@example.com" } },
    auditLogInfo: {}
  };
  const handler = createMcpHandler(() => createMcpServer(server as never, req as never, scopes));
  try {
    const response = await handler.fetch(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      })
    );
    // A request without a protocol version is answered as an SSE stream holding the one result.
    const data = (await response.text()).split("\n").find((line) => line.startsWith("data: "));
    return (JSON.parse(data!.slice("data: ".length)) as { result: T }).result;
  } finally {
    await handler.close();
  }
};

describe("MCP tools", () => {
  // Agents choose arguments from these descriptions alone.
  test("every tool parameter has a description", async () => {
    const { tools } = await callMcp<{ tools: { name: string; inputSchema: TJsonSchema }[] }>(
      Object.values(OauthScope),
      "tools/list"
    );
    expect(tools.length).toBeGreaterThan(0);

    const undescribed = tools.flatMap(({ name, inputSchema }) =>
      Object.entries(inputSchema.properties ?? {})
        .filter(([, schema]) => !schema.description)
        .map(([parameter]) => `${name}.${parameter}`)
    );
    expect(undescribed).toEqual([]);
  });

  // The service needs only describe access to manage a personal secret, which these connections are granted.
  test.each(
    ["create-secret", "update-secret", "delete-secret"].flatMap((tool) =>
      [OauthScope.SecretsDescribe, OauthScope.SecretsRead].map((scope) => [tool, scope])
    )
  )("%s refuses a personal secret on a %s connection", async (tool, scope) => {
    const result = await callMcp<TToolResult>([scope as OauthScope], "tools/call", {
      name: tool,
      arguments: {
        projectId: "project-id",
        environmentSlug: "dev",
        secretName: "DB_PASSWORD",
        secretValue: "local",
        type: "personal"
      }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Reconnect and choose Full Access");
  });

  test.each([
    {
      secretPath: "/app",
      recursive: true,
      folders: [
        { id: "a", name: "db", relativePath: "/db" },
        { id: "b", name: "db", relativePath: "/other/db" }
      ],
      paths: ["/app/db", "/app/other/db"]
    },
    { secretPath: "/", recursive: false, folders: [{ id: "c", name: "app" }], paths: ["/app"] }
  ])(
    "list-folders returns each folder's full path (recursive: $recursive)",
    async ({ secretPath, recursive, folders, paths }) => {
      const result = await callMcp<TToolResult>(
        [OauthScope.SecretsDescribe],
        "tools/call",
        {
          name: "list-folders",
          arguments: { projectId: "project-id", environmentSlug: "dev", secretPath, recursive }
        },
        { folder: { getFolders: vi.fn().mockResolvedValue(folders) } }
      );

      const output = JSON.parse(result.content[0].text) as { path: string }[];
      expect(output.map(({ path }) => path)).toEqual(paths);
    }
  );

  // The service returns the user's own personal values unmasked even when values weren't requested.
  test("list-secrets shows no values on a secrets:describe connection, even personal ones", async () => {
    const personalSecret = {
      id: "secret-id",
      secretKey: "DB_PASSWORD",
      type: "personal",
      secretValue: "my-value",
      secretValueHidden: false,
      secretComment: "",
      secretPath: "/",
      version: 1
    };
    const getSecretsRaw = vi.fn().mockResolvedValue({
      secrets: [personalSecret],
      imports: [{ environment: "dev", secretPath: "/shared", secrets: [personalSecret] }]
    });

    const result = await callMcp<TToolResult>(
      [OauthScope.SecretsDescribe],
      "tools/call",
      {
        name: "list-secrets",
        arguments: { projectId: "project-id", environmentSlug: "dev", includePersonalOverrides: true }
      },
      { secret: { getSecretsRaw } }
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain("my-value");
    const output = JSON.parse(result.content[0].text) as {
      secrets: Record<string, unknown>[];
      imports: { secrets: Record<string, unknown>[] }[];
    };
    expect(output.secrets[0]).toMatchObject({ secretKey: "DB_PASSWORD", secretValueHidden: true });
    expect(output.imports[0].secrets[0]).toMatchObject({ secretValueHidden: true });
  });
});
