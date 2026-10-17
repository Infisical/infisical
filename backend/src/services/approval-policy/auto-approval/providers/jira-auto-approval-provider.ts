import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  findJiraUsersByEmail,
  getJiraErrorMessage,
  getJiraIssue,
  isJiraCloud,
  isJiraNotFoundError,
  listJiraIssueApprovals,
  listJiraIssueTypes,
  listJiraProjects,
  listJiraStatuses,
  searchJiraLabels,
  TJiraConnection,
  TJiraIssue,
  TJiraUser
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
const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9_]+-[1-9][0-9]*$/;
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

const isSameJiraUser = (conn: TJiraConnection, a: TJiraUser, b: TJiraUser) => {
  if (isJiraCloud(conn)) return Boolean(a.accountId) && a.accountId === b.accountId;
  return (Boolean(a.key) && a.key === b.key) || (Boolean(a.name) && a.name === b.name);
};

const matchAssigneeToRequester = async (
  conn: TJiraConnection,
  issue: TJiraIssue,
  ctx: TAutoApprovalContext,
  deps: TAutoApprovalProviderDeps
): Promise<NonNullable<TJiraTicketFacts["assignee"]>> => {
  const { key } = issue;
  const email = ctx.requester.email?.trim().toLowerCase();
  const assignee = issue.fields?.assignee;
  const notAssigned = { matchesRequester: false, reason: `${key} isn't assigned to the requester` };

  if (!email)
    return { matchesRequester: false, reason: "Requests from machine identities can't match a Jira assignee" };
  if (!assignee) return notAssigned;

  if (assignee.emailAddress) {
    return assignee.emailAddress.toLowerCase() === email ? { matchesRequester: true, reason: null } : notAssigned;
  }

  // Jira hides this assignee's email, so find the requester's own Jira account by email instead
  try {
    const users = (await findJiraUsersByEmail(conn, email, deps)).filter((user) => user.active !== false);
    const exactMatches = users.filter((user) => user.emailAddress?.toLowerCase() === email);
    // A user search matches email prefixes, so a hidden email only counts when it is the only candidate
    const candidates = exactMatches.length ? exactMatches : users.filter((user) => !user.emailAddress);

    if (candidates.length === 0) {
      return { matchesRequester: false, reason: "No Jira user has the requester's email address" };
    }
    if (candidates.length > 1) {
      return { matchesRequester: false, reason: "The requester's email address matches more than one Jira user" };
    }

    return isSameJiraUser(conn, candidates[0], assignee) ? { matchesRequester: true, reason: null } : notAssigned;
  } catch (error) {
    return {
      matchesRequester: false,
      reason: `Couldn't look up the requester in Jira: ${getJiraErrorMessage(error)}`
    };
  }
};

const readLatestApproval = async (
  conn: TJiraConnection,
  key: string,
  deps: TAutoApprovalProviderDeps
): Promise<NonNullable<TJiraTicketFacts["approval"]>> => {
  const notApproved = { approved: false, reason: `${key} isn't approved in Jira` };
  try {
    const approvals = await listJiraIssueApprovals(conn, key, deps);
    const sorted = [...approvals].sort((a, b) => (a.createdDate?.epochMillis ?? 0) - (b.createdDate?.epochMillis ?? 0));
    return sorted[sorted.length - 1]?.finalDecision === "approved" ? { approved: true, reason: null } : notApproved;
  } catch (error) {
    if (isJiraNotFoundError(error)) return notApproved;
    return { approved: false, reason: `Couldn't read Jira approvals on ${key}: ${getJiraErrorMessage(error)}` };
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
          throw new BadRequestError({ message: `Couldn't read Jira ticket ${id}: ${getJiraErrorMessage(error)}` });
        }

        const key = issue.key || id;
        const [assignee, approval] = await Promise.all([
          constraintIds.includes(JiraTicketConstraint.AssignedToRequester)
            ? matchAssigneeToRequester(conn, { ...issue, key }, ctx, deps)
            : null,
          constraintIds.includes(JiraTicketConstraint.Approved) ? readLatestApproval(conn, key, deps) : null
        ]);

        return {
          key,
          status: issue.fields?.status?.name ?? null,
          projectKey: issue.fields?.project?.key ?? null,
          issueType: issue.fields?.issuetype?.name ?? null,
          labels: (issue.fields?.labels ?? []).slice(0, MAX_STORED_LABELS),
          assignee,
          approval
        };
      },
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
