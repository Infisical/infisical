import { createMcpHandler } from "@modelcontextprotocol/server";

import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpServer } from "./mcp-server";

vi.mock("@app/lib/request-context/oauth-delegation", () => ({ isScopeNarrowedRequest: () => true }));

type TJsonSchema = { description?: string; properties?: Record<string, TJsonSchema> };

// No service is stubbed besides the denial audit, so a tool call that gets past its own checks fails.
const callMcp = async <T>(scopes: OauthScope[], method: string, params?: Record<string, unknown>) => {
  const server = { services: { auditLog: { recordPermissionDenied: vi.fn().mockResolvedValue(undefined) } } };
  const req = {
    method: "POST",
    permission: { type: "user", id: "user-id", orgId: "org-id", authMethod: null },
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
    const result = await callMcp<{ isError?: boolean; content: { text: string }[] }>(
      [scope as OauthScope],
      "tools/call",
      {
        name: tool,
        arguments: {
          projectId: "project-id",
          environmentSlug: "dev",
          secretName: "DB_PASSWORD",
          secretValue: "local",
          type: "personal"
        }
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Reconnect and choose Full Access");
  });
});
