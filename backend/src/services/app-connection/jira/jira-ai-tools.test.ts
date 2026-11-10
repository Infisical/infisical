import { AxiosError, AxiosResponse } from "axios";

import { BadRequestError } from "@app/lib/errors";

import { buildAppConnectionAiTools } from "../app-connection-ai-tools";
import { AppConnection } from "../app-connection-enums";
import { TAppConnection } from "../app-connection-types";
import { getJiraDescriptionText, JIRA_AI_TOOLS } from "./jira-ai-tools";
import { getJiraIssue, searchJiraIssues } from "./jira-connection-fns";
import { TJiraConnection } from "./jira-connection-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./jira-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./jira-connection-fns")>()),
  getJiraIssue: vi.fn(),
  searchJiraIssues: vi.fn()
}));

const conn = {
  id: "jira-1",
  name: "jira-cloud",
  app: AppConnection.Jira,
  credentials: { instanceUrl: "https://acme.atlassian.net" }
} as unknown as TJiraConnection;

describe("getJiraDescriptionText", () => {
  test("flattens Atlassian Document Format", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Rotate the " },
            { type: "text", text: "db key" }
          ]
        },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] }
      ]
    };
    expect(getJiraDescriptionText(adf)).toBe("Rotate the db key\nSecond line");
  });

  test("keeps Data Center plain text and truncates long descriptions", () => {
    expect(getJiraDescriptionText("plain")).toBe("plain");
    expect(getJiraDescriptionText("x".repeat(3000))).toHaveLength(2000 + "... (truncated)".length);
    expect(getJiraDescriptionText(null)).toBe("");
  });
});

describe("JIRA_AI_TOOLS", () => {
  test("get_ticket trims the issue to what the model needs", async () => {
    vi.mocked(getJiraIssue).mockResolvedValue({
      id: "1",
      key: "INC-1",
      fields: {
        summary: "DB outage",
        status: { id: "1", name: "In Progress" },
        assignee: { displayName: "Dev", emailAddress: "dev@acme.com", accountId: "abc" },
        description: "Primary is down"
      }
    });

    const { result, summary } = await JIRA_AI_TOOLS.get_ticket.run(conn, { key: "INC-1" }, {});

    expect(summary).toBe("Read INC-1 (In Progress, assigned to Dev)");
    expect(result).toMatchObject({
      key: "INC-1",
      summary: "DB outage",
      status: "In Progress",
      assignee: { displayName: "Dev", email: "dev@acme.com" },
      description: "Primary is down"
    });
    expect(JSON.stringify(result)).not.toContain("abc");
  });

  test("get_ticket explains a missing ticket", async () => {
    vi.mocked(getJiraIssue).mockRejectedValue(
      new AxiosError("nope", "404", undefined, undefined, { status: 404, data: {} } as AxiosResponse)
    );

    await expect(JIRA_AI_TOOLS.get_ticket.run(conn, { key: "INC-9" }, {})).rejects.toThrow(
      new BadRequestError({ message: "INC-9 doesn't exist, or the Jira connection can't see it" })
    );
  });

  test("search_tickets reports when more tickets matched", async () => {
    vi.mocked(searchJiraIssues).mockResolvedValue({
      issues: [{ id: "1", key: "INC-1", fields: { summary: "DB outage" } }],
      hasMore: true
    });

    const { result, summary } = await JIRA_AI_TOOLS.search_tickets.run(conn, { jql: "project = INC" }, {});

    expect(summary).toBe("Found 1+ ticket");
    expect(result).toMatchObject({ issues: [{ key: "INC-1", summary: "DB outage" }], hasMore: true });
  });
});

describe("buildAppConnectionAiTools", () => {
  test("names tools per connection and validates the model's input", async () => {
    const second = { ...conn, id: "jira-2", name: "jira-dc" } as unknown as TAppConnection;
    const tools = buildAppConnectionAiTools([conn as unknown as TAppConnection, second], {});

    expect(tools.map((tool) => tool.name)).toEqual([
      "jira_get_ticket",
      "jira_get_ticket_approvals",
      "jira_find_user_by_email",
      "jira_search_tickets",
      "jira2_get_ticket",
      "jira2_get_ticket_approvals",
      "jira2_find_user_by_email",
      "jira2_search_tickets"
    ]);
    expect(tools[4].description).toContain("'jira-dc'");
    expect(tools[0].inputSchema).toMatchObject({ type: "object", required: ["key"] });
    expect(tools[0].inputSchema).not.toHaveProperty("$schema");

    await expect(tools[0].run({ key: "not a key" })).rejects.toThrow("Expected a Jira issue key like PAY-123");
  });
});
