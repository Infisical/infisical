import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { createMcpToolContext } from "./mcp-tool-fns";

vi.mock("@app/lib/request-context/oauth-delegation", () => ({ isScopeNarrowedRequest: () => true }));

type TToolResult = { isError?: boolean; content: { text: string }[] };

const callTool = async ({
  run,
  getOrgPermission = vi.fn().mockResolvedValue({})
}: {
  run: () => Promise<unknown>;
  getOrgPermission?: () => Promise<unknown>;
}) => {
  const recordPermissionDenied = vi.fn().mockResolvedValue(undefined);
  let handler: ((args: Record<string, unknown>) => Promise<TToolResult>) | undefined;
  const mcpServer = {
    registerTool: (_name: string, _config: unknown, callback: typeof handler) => {
      handler = callback;
    }
  };
  const server = { services: { auditLog: { recordPermissionDenied }, permission: { getOrgPermission } } };
  const req = {
    method: "POST",
    auditLogInfo: { ipAddress: "203.0.113.1" },
    permission: { type: "user", id: "user-id", orgId: "org-id", authMethod: null }
  };

  const { registerTool } = createMcpToolContext(server as never, req as never, mcpServer as never, []);
  registerTool("create-project", { description: "", inputSchema: z.object({}), annotations: {} }, run);

  const result = await handler!({ projectId: "project-id" });
  return { result, recordPermissionDenied };
};

const callFailingTool = (error: unknown) => callTool({ run: () => Promise.reject(error) });

const caslDenial = () => {
  try {
    ForbiddenError.from(createMongoAbility([])).throwUnlessCan("create", "secrets");
  } catch (error) {
    return error;
  }
};

describe("MCP tool refusals", () => {
  test("a ForbiddenRequestError is recorded as a permission denial", async () => {
    const { result, recordPermissionDenied } = await callFailingTool(
      new ForbiddenRequestError({ message: "You don't have permission to create a project" })
    );

    expect(result).toEqual({
      content: [{ type: "text", text: "You don't have permission to create a project" }],
      isError: true
    });
    expect(recordPermissionDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-id",
        projectId: "project-id",
        metadata: { errorName: "ForbiddenError", route: "MCP tool create-project", method: "POST" }
      })
    );
  });

  test("a CASL denial is recorded with the permission it names", async () => {
    const { recordPermissionDenied } = await callFailingTool(caslDenial());

    const [[denial]] = recordPermissionDenied.mock.calls as [[{ metadata: Record<string, unknown> }]];
    expect(denial.metadata).toMatchObject({
      permissionAction: "create",
      permissionSubject: "secrets",
      route: "MCP tool create-project"
    });
  });

  test("an error that isn't a refusal is not recorded", async () => {
    const { result, recordPermissionDenied } = await callFailingTool(new NotFoundError({ message: "Not found" }));

    expect(result.isError).toBe(true);
    expect(recordPermissionDenied).not.toHaveBeenCalled();
  });

  test("a user the org check refuses, such as under newly enforced SSO, never reaches the tool", async () => {
    const run = vi.fn();
    const { result, recordPermissionDenied } = await callTool({
      run,
      getOrgPermission: () =>
        Promise.reject(new ForbiddenRequestError({ message: "Your organization requires logging in with SSO" }))
    });

    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [{ type: "text", text: "Your organization requires logging in with SSO" }],
      isError: true
    });
    expect(recordPermissionDenied).toHaveBeenCalled();
  });
});
