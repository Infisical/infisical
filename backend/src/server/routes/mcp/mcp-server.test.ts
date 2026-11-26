import { createMcpHandler } from "@modelcontextprotocol/server";

import { OauthScope } from "@app/services/oauth-client/oauth-scope";

import { createMcpServer } from "./mcp-server";

type TJsonSchema = { description?: string; properties?: Record<string, TJsonSchema> };

const listTools = async () => {
  const req = {
    permission: { type: "user", id: "user-id", orgId: "org-id", authMethod: null },
    auditLogInfo: {}
  };
  const handler = createMcpHandler(() => createMcpServer({} as never, req as never, Object.values(OauthScope)));
  try {
    const response = await handler.fetch(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      })
    );
    // A request without a protocol version is answered as an SSE stream holding the one result.
    const data = (await response.text()).split("\n").find((line) => line.startsWith("data: "));
    const { result } = JSON.parse(data!.slice("data: ".length)) as {
      result: { tools: { name: string; inputSchema: TJsonSchema }[] };
    };
    return result.tools;
  } finally {
    await handler.close();
  }
};

describe("MCP tools", () => {
  // Agents choose arguments from these descriptions alone.
  test("every tool parameter has a description", async () => {
    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(0);

    const undescribed = tools.flatMap(({ name, inputSchema }) =>
      Object.entries(inputSchema.properties ?? {})
        .filter(([, schema]) => !schema.description)
        .map(([parameter]) => `${name}.${parameter}`)
    );
    expect(undescribed).toEqual([]);
  });
});
