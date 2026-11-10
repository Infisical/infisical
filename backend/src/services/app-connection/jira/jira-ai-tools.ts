import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { defineAiTool } from "@app/services/ai/ai-types";

import {
  findJiraUsersByEmail,
  getJiraErrorMessage,
  getJiraIssue,
  isJiraNotFoundError,
  listJiraIssueApprovals,
  searchJiraIssues
} from "./jira-connection-fns";
import { TJiraConnection, TJiraIssue, TJiraUser } from "./jira-connection-types";

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SEARCH_RESULTS = 10;
const MAX_USERS = 5;
const ISSUE_KEY_REGEX = new RE2("^[A-Z][A-Z0-9_]+-[1-9][0-9]*$");

const TICKET_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "priority",
  "project",
  "assignee",
  "reporter",
  "labels",
  "created",
  "updated",
  "description"
];
const SEARCH_FIELDS = ["summary", "status", "issuetype", "assignee", "updated"];

const IssueKeySchema = z
  .string()
  .trim()
  .max(64)
  .transform((key) => key.toUpperCase())
  .refine((key) => ISSUE_KEY_REGEX.test(key), "Expected a Jira issue key like PAY-123");

type TAdfNode = { type?: string; text?: string; content?: TAdfNode[] };

const BLOCK_NODES = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock", "tableRow"]);

const adfToText = (node: TAdfNode): string => {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(adfToText).join("");
  return BLOCK_NODES.has(node.type ?? "") ? `${inner}\n` : inner;
};

export const getJiraDescriptionText = (description: unknown) => {
  let text = "";
  if (typeof description === "string") text = description;
  else if (description && typeof description === "object") text = adfToText(description as TAdfNode);

  text = text.trim();
  return text.length > MAX_DESCRIPTION_LENGTH ? `${text.slice(0, MAX_DESCRIPTION_LENGTH)}... (truncated)` : text;
};

const toPerson = (user?: TJiraUser | null) =>
  user ? { displayName: user.displayName ?? null, email: user.emailAddress ?? null } : null;

const toToolError = (error: unknown, key?: string) => {
  if (key && isJiraNotFoundError(error)) {
    return new BadRequestError({ message: `${key} doesn't exist, or the Jira connection can't see it` });
  }
  return new BadRequestError({ message: getJiraErrorMessage(error) });
};

const toTicket = (issue: TJiraIssue) => ({
  key: issue.key,
  summary: issue.fields?.summary ?? null,
  status: issue.fields?.status?.name ?? null,
  type: issue.fields?.issuetype?.name ?? null,
  priority: issue.fields?.priority?.name ?? null,
  project: issue.fields?.project ? { key: issue.fields.project.key, name: issue.fields.project.name } : null,
  assignee: toPerson(issue.fields?.assignee),
  reporter: toPerson(issue.fields?.reporter),
  labels: issue.fields?.labels ?? [],
  created: issue.fields?.created ?? null,
  updated: issue.fields?.updated ?? null,
  description: getJiraDescriptionText(issue.fields?.description)
});

export const JIRA_AI_TOOLS = {
  get_ticket: defineAiTool({
    description:
      "Get one Jira ticket by key: summary, status, type, priority, project, assignee, reporter, labels, dates and description.",
    inputSchema: z.object({ key: IssueKeySchema.describe("The ticket key, like PAY-123") }),
    run: async (conn: TJiraConnection, { key }, deps) => {
      let issue: TJiraIssue;
      try {
        issue = await getJiraIssue(conn, key, TICKET_FIELDS, deps);
      } catch (error) {
        throw toToolError(error, key);
      }
      const ticket = toTicket(issue);
      const assignee = ticket.assignee?.displayName ? `, assigned to ${ticket.assignee.displayName}` : ", unassigned";
      return {
        result: ticket,
        summary: `Read ${ticket.key} (${ticket.status ?? "no status"}${assignee})`
      };
    }
  }),
  get_ticket_approvals: defineAiTool({
    description:
      "List the Jira Service Management approvals on a ticket, with each approval's decision (approved, declined or pending) and dates.",
    inputSchema: z.object({ key: IssueKeySchema.describe("The ticket key, like PAY-123") }),
    run: async (conn: TJiraConnection, { key }, deps) => {
      let approvals;
      try {
        approvals = await listJiraIssueApprovals(conn, key, deps);
      } catch (error) {
        if (error instanceof BadRequestError) throw error;
        throw toToolError(error, key);
      }
      const result = approvals.map((approval) => ({
        name: approval.name ?? null,
        decision: approval.finalDecision,
        createdAt: approval.createdDate?.iso8601 ?? null,
        completedAt: approval.completedDate?.iso8601 ?? null
      }));
      return {
        result,
        summary: result.length
          ? `Read ${result.length} approval${result.length === 1 ? "" : "s"} on ${key}`
          : `${key} has no approvals`
      };
    }
  }),
  find_user_by_email: defineAiTool({
    description: "Find Jira users by email address, for example to check whether a ticket's assignee is the requester.",
    inputSchema: z.object({ email: z.string().trim().email().max(320).describe("The email address to look up") }),
    run: async (conn: TJiraConnection, { email }, deps) => {
      let users: TJiraUser[];
      try {
        users = await findJiraUsersByEmail(conn, email, deps);
      } catch (error) {
        throw toToolError(error);
      }
      const result = users.slice(0, MAX_USERS).map((user) => ({
        displayName: user.displayName ?? null,
        email: user.emailAddress ?? null,
        active: user.active ?? null
      }));
      return {
        result,
        summary: `Found ${result.length} Jira user${result.length === 1 ? "" : "s"} for ${email}`
      };
    }
  }),
  search_tickets: defineAiTool({
    description: `Search Jira tickets with JQL. Returns at most ${MAX_SEARCH_RESULTS} tickets with key, summary, status, type, assignee and last update, and whether more matched.`,
    inputSchema: z.object({
      jql: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .describe('A JQL query, like project = OPS AND status = "In Progress" ORDER BY updated DESC')
    }),
    run: async (conn: TJiraConnection, { jql }, deps) => {
      let page: Awaited<ReturnType<typeof searchJiraIssues>>;
      try {
        page = await searchJiraIssues(conn, { jql, fields: SEARCH_FIELDS, maxResults: MAX_SEARCH_RESULTS }, deps);
      } catch (error) {
        throw toToolError(error);
      }
      const issues = page.issues.slice(0, MAX_SEARCH_RESULTS).map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary ?? null,
        status: issue.fields?.status?.name ?? null,
        type: issue.fields?.issuetype?.name ?? null,
        assignee: toPerson(issue.fields?.assignee),
        updated: issue.fields?.updated ?? null
      }));
      return {
        result: { issues, hasMore: page.hasMore },
        summary: `Found ${issues.length}${page.hasMore ? "+" : ""} ticket${issues.length === 1 ? "" : "s"}`
      };
    }
  })
};
