import { describe, expect, test } from "vitest";

import { mcpServerUrlSchema } from "./env";

describe("MCP_SERVER_URL parsing", () => {
  test("is optional", () => {
    expect(mcpServerUrlSchema.parse(undefined)).toBeUndefined();
    expect(mcpServerUrlSchema.parse("  ")).toBeUndefined();
  });

  test("drops a trailing slash, which clients may or may not send in the resource parameter", () => {
    expect(mcpServerUrlSchema.parse("https://mcp.example.com/mcp/")).toBe("https://mcp.example.com/mcp");
  });

  test.each([
    "mcp.example.com/mcp",
    "ftp://mcp.example.com",
    "https://mcp.example.com/mcp?a=b",
    "https://mcp.example.com/mcp#a"
  ])("rejects %s", (url) => {
    expect(mcpServerUrlSchema.safeParse(url).success).toBe(false);
  });
});
