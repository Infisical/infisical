import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  getJiraErrorMessage,
  getJiraIssue,
  isJiraNotFoundError,
  listJiraIssueApprovals,
  listJiraIssueTypes,
  listJiraProjects,
  listJiraStatuses,
  searchJiraLabels,
  TJiraConnection,
  TJiraIssue
} from "@app/services/app-connection/jira";

import {
  AutoApprovalConstraintValue,
  TAutoApprovalContext,
  TAutoApprovalOption,
  TAutoApprovalProvider,
  TAutoApprovalProviderDeps,
  TAutoApprovalTestResult
} from "../auto-approval-types";

export const JIRA_SUBMITTED_TICKET_SUBJECT = "submitted-ticket";

export enum JiraTicketConstraint {
  AssignedToRequester = "assigned-to-requester",
  Approved = "approved",
  Status = "status",
  Project = "project",
  Type = "type",
  Label = "label"
}

export type TJiraTicketFacts = {
  // Stays the same when the ticket moves to another project and gets a new key
  issueId: string | null;
  key: string;
  status: string | null;
  projectKey: string | null;
  issueType: string | null;
  labels: string[];
  // Only fetched when a condition in use needs them
  assignee: { matchesRequester: boolean; reason: string | null } | null;
  approval: { approved: boolean; reason: string | null } | null;
};

const JIRA_TICKET_FIELDS = ["status", "project", "issuetype", "labels", "assignee"];
const JIRA_ISSUE_KEY_REGEX = new RE2("^[A-Z][A-Z0-9_]+-[1-9][0-9]*$");
const MAX_TICKET_INPUT_LENGTH = 2048;
const MAX_STORED_LABELS = 100;
const MAX_OPTIONS = 100;
const MAX_SIBLING_PROJECTS = 5;

const TICKET_FORMAT_MESSAGE = "Enter a Jira ticket key like PAY-123, or a link to the ticket";

const anyOf = (values: string[]) => values.join(" or ");

const includesIgnoreCase = (values: string[], value: string | null) =>
  value !== null && values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());

const matchesSearch = (search: string | undefined, ...values: string[]) =>
  !search || values.some((value) => value.toLowerCase().includes(search.toLowerCase()));

const toNameOptions = (names: { name: string }[], search?: string): TAutoApprovalOption[] =>
  names
    .filter(({ name }) => matchesSearch(search, name))
    .slice(0, MAX_OPTIONS)
    .map(({ name }) => ({ value: name, label: name }));

const withOptionsError = async <T>(what: string, fetch: () => Promise<T>) => {
  try {
    return await fetch();
  } catch (error) {
    throw new BadRequestError({ message: `Couldn't load ${what} from Jira: ${getJiraErrorMessage(error)}` });
  }
};

export const parseJiraTicket = (userInput: string, conn: Pick<TJiraConnection, "credentials">) => {
  const trimmed = userInput.trim();
  if (!trimmed || trimmed.length > MAX_TICKET_INPUT_LENGTH) {
    throw new BadRequestError({ message: TICKET_FORMAT_MESSAGE });
  }

  if (JIRA_ISSUE_KEY_REGEX.test(trimmed.toUpperCase())) return trimmed.toUpperCase();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestError({ message: TICKET_FORMAT_MESSAGE });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BadRequestError({ message: TICKET_FORMAT_MESSAGE });
  }

  const site = new URL(conn.credentials.instanceUrl);
  if (url.host.toLowerCase() !== site.host.toLowerCase()) {
    throw new BadRequestError({
      message: `That link is for ${url.host}, but this Jira connection is for ${site.host}. Link a ticket on ${site.host}.`
    });
  }

  const segments = url.pathname
    .split("/")
    .reverse()
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  const key = [url.searchParams.get("selectedIssue"), ...segments]
    .map((candidate) => candidate?.toUpperCase())
    .find((candidate): candidate is string => Boolean(candidate && JIRA_ISSUE_KEY_REGEX.test(candidate)));

  if (!key) {
    throw new BadRequestError({ message: `That link doesn't point to a Jira ticket. ${TICKET_FORMAT_MESSAGE}.` });
  }

  return key;
};

const matchAssigneeToRequester = (
  issue: TJiraIssue,
  ctx: TAutoApprovalContext
): NonNullable<TJiraTicketFacts["assignee"]> => {
  const assignee = issue.fields?.assignee;
  if (!assignee) return { matchesRequester: false, reason: `${issue.key} isn't assigned to anyone` };

  // A hidden email can't be confirmed to be the requester's, so only an exact, visible email matches
  const assigneeEmail = assignee.emailAddress?.trim().toLowerCase();
  if (!assigneeEmail) {
    return { matchesRequester: false, reason: `Jira doesn't share the email address of ${issue.key}'s assignee` };
  }

  const email = ctx.requester.email?.trim().toLowerCase();
  return email && assigneeEmail === email
    ? { matchesRequester: true, reason: null }
    : { matchesRequester: false, reason: `${issue.key} isn't assigned to the requester` };
};

const readLatestApproval = async (
  conn: TJiraConnection,
  key: string,
  deps: TAutoApprovalProviderDeps
): Promise<NonNullable<TJiraTicketFacts["approval"]>> => {
  try {
    const approvals = await listJiraIssueApprovals(conn, key, deps);
    if (!approvals.length) return { approved: false, reason: `${key} has no approvals in Jira yet` };

    const sorted = [...approvals].sort((a, b) => (a.createdDate?.epochMillis ?? 0) - (b.createdDate?.epochMillis ?? 0));
    return sorted[sorted.length - 1]?.finalDecision === "approved"
      ? { approved: true, reason: null }
      : { approved: false, reason: `${key} isn't approved in Jira` };
  } catch (error) {
    if (isJiraNotFoundError(error)) {
      return {
        approved: false,
        reason: `${key} isn't a Jira Service Management request, or the Jira connection can't see its approvals`
      };
    }
    if (error instanceof BadRequestError) return { approved: false, reason: error.message };
    logger.warn({ err: error }, `Couldn't read Jira approvals [issueKey=${key}]`);
    return { approved: false, reason: `Couldn't read Jira approvals on ${key}` };
  }
};

const testValue = (actual: string | null, values: string[], noun: string): TAutoApprovalTestResult =>
  includesIgnoreCase(values, actual) ? { pass: true } : { pass: false, reason: `${noun} isn't ${anyOf(values)}` };

export const JIRA_AUTO_APPROVAL_PROVIDER: TAutoApprovalProvider<TJiraConnection> = {
  app: AppConnection.Jira,
  subjects: {
    [JIRA_SUBMITTED_TICKET_SUBJECT]: {
      label: "Jira ticket",
      input: {
        label: "Jira ticket",
        placeholder: "PAY-123 or a link to the ticket",
        parse: parseJiraTicket,
        getUrl: (id, conn) => `${removeTrailingSlash(conn.credentials.instanceUrl)}/browse/${encodeURIComponent(id)}`
      },
      resolve: async (conn, id, ctx, constraintIds, deps): Promise<TJiraTicketFacts> => {
        if (!id) throw new BadRequestError({ message: "No Jira ticket was provided" });

        let issue: TJiraIssue;
        try {
          issue = await getJiraIssue(conn, id, JIRA_TICKET_FIELDS, deps);
        } catch (error) {
          if (isJiraNotFoundError(error)) {
            throw new BadRequestError({
              message: `Jira ticket ${id} doesn't exist, or the Jira connection can't see it`
            });
          }
          if (error instanceof BadRequestError) throw error;
          logger.warn({ err: error }, `Couldn't read Jira ticket [issueKey=${id}]`);
          throw new BadRequestError({ message: `Couldn't read Jira ticket ${id}` });
        }

        const key = issue.key || id;
        const [assignee, approval] = await Promise.all([
          constraintIds.includes(JiraTicketConstraint.AssignedToRequester)
            ? matchAssigneeToRequester({ ...issue, key }, ctx)
            : null,
          constraintIds.includes(JiraTicketConstraint.Approved) ? readLatestApproval(conn, key, deps) : null
        ]);

        return {
          issueId: issue.id || null,
          key,
          status: issue.fields?.status?.name ?? null,
          projectKey: issue.fields?.project?.key ?? null,
          issueType: issue.fields?.issuetype?.name ?? null,
          labels: (issue.fields?.labels ?? []).slice(0, MAX_STORED_LABELS),
          assignee,
          approval
        };
      },
      getStableId: (facts: TJiraTicketFacts) => facts.issueId,
      constraints: {
        [JiraTicketConstraint.AssignedToRequester]: {
          label: "is assigned to the requester",
          value: AutoApprovalConstraintValue.None,
          test: (facts: TJiraTicketFacts) =>
            facts.assignee?.matchesRequester
              ? { pass: true }
              : { pass: false, reason: facts.assignee?.reason ?? "Couldn't check the ticket's assignee" }
        },
        [JiraTicketConstraint.Approved]: {
          label: "is approved in Jira",
          value: AutoApprovalConstraintValue.None,
          test: (facts: TJiraTicketFacts) =>
            facts.approval?.approved
              ? { pass: true }
              : { pass: false, reason: facts.approval?.reason ?? "Couldn't check the ticket's Jira approvals" }
        },
        [JiraTicketConstraint.Status]: {
          label: "has status",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search, siblings }, deps) => {
            const projectKeys = (siblings[JiraTicketConstraint.Project] ?? []).slice(0, MAX_SIBLING_PROJECTS);
            const statuses = await withOptionsError("statuses", () => listJiraStatuses(conn, { projectKeys }, deps));
            return toNameOptions(statuses, search);
          },
          test: (facts: TJiraTicketFacts, values) => testValue(facts.status, values, "status")
        },
        [JiraTicketConstraint.Project]: {
          label: "is in project",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search }, deps) => {
            const projects = await withOptionsError("projects", () => listJiraProjects(conn, { search }, deps));
            return projects.slice(0, MAX_OPTIONS).map(({ key, name }) => ({ value: key, label: `${name} (${key})` }));
          },
          test: (facts: TJiraTicketFacts, values) => testValue(facts.projectKey, values, "project")
        },
        [JiraTicketConstraint.Type]: {
          label: "is of type",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search, siblings }, deps) => {
            const projectKeys = (siblings[JiraTicketConstraint.Project] ?? []).slice(0, MAX_SIBLING_PROJECTS);
            const issueTypes = await withOptionsError("issue types", () =>
              listJiraIssueTypes(conn, { projectKeys }, deps)
            );
            return toNameOptions(issueTypes, search);
          },
          test: (facts: TJiraTicketFacts, values) => testValue(facts.issueType, values, "type")
        },
        [JiraTicketConstraint.Label]: {
          label: "has label",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search }, deps) => {
            const labels = await withOptionsError("labels", () => searchJiraLabels(conn, { search }, deps));
            return labels.slice(0, MAX_OPTIONS).map((label) => ({ value: label, label }));
          },
          test: (facts: TJiraTicketFacts, values) => {
            if (facts.labels.some((label) => includesIgnoreCase(values, label))) return { pass: true };
            return { pass: false, reason: `doesn't have label ${anyOf(values)}` };
          }
        }
      }
    }
  }
};
