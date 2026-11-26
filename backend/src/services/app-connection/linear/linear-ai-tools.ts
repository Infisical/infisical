import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { defineAiTool } from "@app/services/ai/ai-types";

import {
  findLinearUsersByEmail,
  getLinearErrorMessage,
  getLinearIssue,
  isLinearNotFoundError,
  LINEAR_ISSUE_IDENTIFIER_REGEX,
  searchLinearIssues
} from "./linear-connection-fns";
import { TLinearConnection, TLinearIssue, TLinearUser } from "./linear-connection-types";

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 1000;
const MAX_COMMENTS = 20;
const MAX_SEARCH_RESULTS = 10;
const MAX_USERS = 5;

const IdentifierSchema = z
  .string()
  .trim()
  .max(64)
  .transform((identifier) => identifier.toUpperCase())
  .refine((identifier) => LINEAR_ISSUE_IDENTIFIER_REGEX.test(identifier), "Expected a Linear issue ID like ENG-123");

const truncate = (text: string | null | undefined, max: number) => {
  const trimmed = (text ?? "").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}... (truncated)` : trimmed;
};

const toPerson = (user?: TLinearUser | null) =>
  user ? { name: user.name || user.displayName || null, email: user.email ?? null } : null;

const isSameUser = (a?: TLinearUser | null, b?: TLinearUser | null) => Boolean(a?.id && b?.id && a.id === b.id);

const toToolError = (error: unknown, identifier?: string) => {
  if (identifier && isLinearNotFoundError(error)) {
    return new BadRequestError({ message: `${identifier} doesn't exist, or the Linear connection can't see it` });
  }
  return new BadRequestError({ message: getLinearErrorMessage(error) });
};

const toIssue = (issue: TLinearIssue) => ({
  identifier: issue.identifier,
  title: issue.title ?? null,
  status: issue.state?.name ?? null,
  statusCategory: issue.state?.type ?? null,
  priority: issue.priorityLabel ?? null,
  team: issue.team ? { key: issue.team.key, name: issue.team.name } : null,
  project: issue.project?.name ?? null,
  assignee: toPerson(issue.assignee),
  creator: toPerson(issue.creator),
  labels: (issue.labels?.nodes ?? []).map(({ name }) => name),
  created: issue.createdAt ?? null,
  updated: issue.updatedAt ?? null,
  url: issue.url ?? null,
  archived: Boolean(issue.archivedAt),
  trashed: Boolean(issue.trashed),
  description: truncate(issue.description, MAX_DESCRIPTION_LENGTH),
  comments: [...(issue.comments?.nodes ?? [])]
    .sort((a, b) => Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? ""))
    .map((comment) => ({
      author: toPerson(comment.user),
      writtenByAssignee: isSameUser(comment.user, issue.assignee),
      writtenByCreator: isSameUser(comment.user, issue.creator),
      created: comment.createdAt ?? null,
      body: truncate(comment.body, MAX_COMMENT_LENGTH)
    }))
});

export const LINEAR_AI_TOOLS = {
  get_issue: defineAiTool({
    description: `Get one Linear issue by ID: title, status, priority, team, project, assignee, creator, labels, dates, whether it's archived or in the trash, description, and its latest ${MAX_COMMENTS} comments, oldest first. Users can change their own names, so identify people by email. Each comment says whether the issue's assignee or creator wrote it.`,
    inputSchema: z.object({ identifier: IdentifierSchema.describe("The issue ID, like ENG-123") }),
    run: async (conn: TLinearConnection, { identifier }, deps) => {
      let issue: TLinearIssue;
      try {
        issue = await getLinearIssue(conn, identifier, { signal: deps.signal, commentCount: MAX_COMMENTS });
      } catch (error) {
        throw toToolError(error, identifier);
      }
      const result = toIssue(issue);
      const assignee = result.assignee?.name ? `, assigned to ${result.assignee.name}` : ", unassigned";
      return {
        result,
        summary: `Read ${result.identifier} (${result.status ?? "no status"}${assignee})`
      };
    }
  }),
  find_user_by_email: defineAiTool({
    description:
      "Find Linear users by email address, for example to check whether an issue's assignee is the requester.",
    inputSchema: z.object({ email: z.string().trim().email().max(320).describe("The email address to look up") }),
    run: async (conn: TLinearConnection, { email }, deps) => {
      let users: TLinearUser[];
      try {
        users = await findLinearUsersByEmail(conn, email, deps.signal);
      } catch (error) {
        throw toToolError(error);
      }
      const result = users.slice(0, MAX_USERS).map((user) => ({ ...toPerson(user)!, active: user.active ?? null }));
      return {
        result,
        summary: `Found ${result.length} Linear user${result.length === 1 ? "" : "s"} for ${email}`
      };
    }
  }),
  search_issues: defineAiTool({
    description: `Search Linear issues by text. Returns at most ${MAX_SEARCH_RESULTS} issues with ID, title, status, team, assignee and last update, and whether more matched.`,
    inputSchema: z.object({
      term: z.string().trim().min(1).max(256).describe("Words to search for in issue titles and descriptions")
    }),
    run: async (conn: TLinearConnection, { term }, deps) => {
      let page: Awaited<ReturnType<typeof searchLinearIssues>>;
      try {
        page = await searchLinearIssues(conn, { term, first: MAX_SEARCH_RESULTS }, deps.signal);
      } catch (error) {
        throw toToolError(error);
      }
      const issues = page.issues.slice(0, MAX_SEARCH_RESULTS).map((issue) => ({
        identifier: issue.identifier,
        title: issue.title ?? null,
        status: issue.state?.name ?? null,
        team: issue.team?.key ?? null,
        assignee: toPerson(issue.assignee),
        updated: issue.updatedAt ?? null
      }));
      return {
        result: { issues, hasMore: page.hasMore },
        summary: `Found ${issues.length}${page.hasMore ? "+" : ""} issue${issues.length === 1 ? "" : "s"}`
      };
    }
  })
};
