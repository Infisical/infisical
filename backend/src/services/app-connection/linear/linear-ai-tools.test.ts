import { BadRequestError } from "@app/lib/errors";

import { buildAppConnectionAiTools } from "../app-connection-ai-tools";
import { AppConnection } from "../app-connection-enums";
import { TAppConnection } from "../app-connection-types";
import { LINEAR_AI_TOOLS } from "./linear-ai-tools";
import {
  findLinearUsersByEmail,
  getLinearIssue,
  LinearGraphqlError,
  searchLinearIssues
} from "./linear-connection-fns";
import { TLinearConnection } from "./linear-connection-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./linear-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./linear-connection-fns")>()),
  getLinearIssue: vi.fn(),
  searchLinearIssues: vi.fn(),
  findLinearUsersByEmail: vi.fn()
}));

const conn = {
  id: "linear-1",
  name: "linear-eng",
  app: AppConnection.Linear,
  credentials: { apiKey: "lin_api_x", workspaceUrlKey: "acme" }
} as unknown as TLinearConnection;

describe("LINEAR_AI_TOOLS", () => {
  test("get_issue trims the issue and lists comments oldest first", async () => {
    vi.mocked(getLinearIssue).mockResolvedValue({
      id: "uuid-1",
      identifier: "INC-1",
      title: "DB outage",
      state: { name: "In Progress", type: "started" },
      assignee: { id: "u-dev", displayName: "Dev", email: "dev@acme.com" },
      description: "x".repeat(3000),
      comments: {
        nodes: [
          { body: "Approved", createdAt: "2026-11-02T00:00:00Z", user: { name: "Manager", email: "mgr@acme.com" } },
          {
            body: "Please approve",
            createdAt: "2026-11-01T00:00:00Z",
            user: { id: "u-dev", name: "Dev", email: "dev@acme.com" }
          }
        ]
      }
    });

    const { result, summary } = await LINEAR_AI_TOOLS.get_issue.run(conn, { identifier: "INC-1" }, {});

    expect(getLinearIssue).toHaveBeenCalledWith(conn, "INC-1", { signal: undefined, commentCount: 20 });
    expect(summary).toBe("Read INC-1 (In Progress, assigned to Dev)");
    expect(result).toMatchObject({
      identifier: "INC-1",
      title: "DB outage",
      status: "In Progress",
      statusCategory: "started",
      assignee: { name: "Dev", email: "dev@acme.com" },
      comments: [
        { author: { name: "Dev" }, body: "Please approve", writtenByAssignee: true },
        { author: { name: "Manager" }, body: "Approved", writtenByAssignee: false }
      ]
    });
    expect((result as { description: string }).description).toHaveLength(2000 + "... (truncated)".length);
  });

  test("get_issue explains a missing issue", async () => {
    vi.mocked(getLinearIssue).mockRejectedValue(new LinearGraphqlError({ message: "Entity not found: Issue" }));

    await expect(LINEAR_AI_TOOLS.get_issue.run(conn, { identifier: "INC-9" }, {})).rejects.toThrow(
      new BadRequestError({ message: "INC-9 doesn't exist, or the Linear connection can't see it" })
    );
  });

  test("find_user_by_email returns at most five users", async () => {
    vi.mocked(findLinearUsersByEmail).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, name: `User ${i}`, email: "dev@acme.com", active: i > 0 }))
    );

    const { result } = await LINEAR_AI_TOOLS.find_user_by_email.run(conn, { email: "dev@acme.com" }, {});

    expect(result).toHaveLength(5);
  });

  test("tool errors explain a rejected key", async () => {
    vi.mocked(getLinearIssue).mockRejectedValue(
      new LinearGraphqlError({ message: "x", extensions: { code: "AUTHENTICATION_ERROR" } })
    );

    await expect(LINEAR_AI_TOOLS.get_issue.run(conn, { identifier: "INC-1" }, {})).rejects.toThrow(
      "Linear rejected the connection's API key"
    );
  });

  test("search_issues reports when more issues matched", async () => {
    vi.mocked(searchLinearIssues).mockResolvedValue({
      issues: [{ id: "uuid-1", identifier: "INC-1", title: "DB outage" }],
      hasMore: true
    });

    const { result, summary } = await LINEAR_AI_TOOLS.search_issues.run(conn, { term: "outage" }, {});

    expect(summary).toBe("Found 1+ issue");
    expect(result).toMatchObject({ issues: [{ identifier: "INC-1", title: "DB outage" }], hasMore: true });
  });

  test("tools validate the model's input", async () => {
    const tools = buildAppConnectionAiTools([conn as unknown as TAppConnection], {});

    expect(tools.map((tool) => tool.name)).toEqual([
      "linear_get_issue",
      "linear_find_user_by_email",
      "linear_search_issues"
    ]);
    expect(tools[0].description).toContain("'linear-eng'");
    await expect(tools[0].run({ identifier: "not an issue" })).rejects.toThrow(
      "Expected a Linear issue ID like ENG-123"
    );
  });
});
