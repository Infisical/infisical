import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  getLinearErrorMessage,
  getLinearIssue,
  getLinearIssueHistory,
  isLinearNotFoundError,
  LINEAR_ISSUE_IDENTIFIER_REGEX,
  LINEAR_SITE_HOST,
  listLinearLabels,
  listLinearStatuses,
  listLinearTeams,
  listLinearUsers,
  TLinearConnection,
  TLinearHistoryEntry,
  TLinearIssue
} from "@app/services/app-connection/linear";

import { anyOf, AUTO_APPROVAL_MAX_OPTIONS as MAX_OPTIONS } from "../auto-approval-fns";
import {
  AutoApprovalConstraintValue,
  TAutoApprovalContext,
  TAutoApprovalProvider,
  TAutoApprovalProviderDeps,
  TAutoApprovalTestResult
} from "../auto-approval-types";

export const LINEAR_SUBMITTED_ISSUE_SUBJECT = "submitted-issue";

export enum LinearIssueConstraint {
  AssignedToRequester = "assigned-to-requester",
  Status = "status",
  Team = "team",
  Label = "label",
  StatusSetBy = "status-set-by"
}

export type TLinearIssueFacts = {
  // Stays the same when the issue moves to another team and gets a new identifier
  issueId: string | null;
  identifier: string;
  status: string | null;
  teamKey: string | null;
  labels: string[];
  assignee: { matchesRequester: boolean; reason: string | null } | null;
  statusSetter: { email: string | null; reason: string | null } | null;
};

const MAX_ISSUE_INPUT_LENGTH = 2048;
const MAX_STORED_LABELS = 100;

const ISSUE_FORMAT_MESSAGE = "Enter a Linear issue ID like ENG-123, or a link to the issue";

const includesIgnoreCase = (values: string[], value: string | null) =>
  value !== null && values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());

const withOptionsError = async <T>(what: string, fetch: () => Promise<T>) => {
  try {
    return await fetch();
  } catch (error) {
    throw new BadRequestError({ message: `Couldn't load ${what} from Linear: ${getLinearErrorMessage(error)}` });
  }
};

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const parseLinearIssue = (userInput: string, conn: Pick<TLinearConnection, "credentials">) => {
  let trimmed = userInput.trim();
  if (!trimmed || trimmed.length > MAX_ISSUE_INPUT_LENGTH) {
    throw new BadRequestError({ message: ISSUE_FORMAT_MESSAGE });
  }

  if (LINEAR_ISSUE_IDENTIFIER_REGEX.test(trimmed.toUpperCase())) return trimmed.toUpperCase();
  if (trimmed.toLowerCase().startsWith(`${LINEAR_SITE_HOST}/`)) trimmed = `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestError({ message: ISSUE_FORMAT_MESSAGE });
  }

  if (url.protocol !== "https:" || url.host.toLowerCase() !== LINEAR_SITE_HOST) {
    throw new BadRequestError({ message: `That link isn't on ${LINEAR_SITE_HOST}. ${ISSUE_FORMAT_MESSAGE}.` });
  }

  // Issue links look like https://linear.app/<workspace>/issue/ENG-123/<title>
  const [workspace, kind, identifier] = url.pathname.split("/").filter(Boolean).map(decodeSegment);
  const candidate = identifier?.toUpperCase();
  if (kind !== "issue" || !candidate || !LINEAR_ISSUE_IDENTIFIER_REGEX.test(candidate)) {
    throw new BadRequestError({ message: `That link doesn't point to a Linear issue. ${ISSUE_FORMAT_MESSAGE}.` });
  }

  const { workspaceUrlKey } = conn.credentials;
  if (workspaceUrlKey && workspace.toLowerCase() !== workspaceUrlKey.toLowerCase()) {
    throw new BadRequestError({
      message: `That link is for the Linear workspace ${workspace}, but this Linear connection is for ${workspaceUrlKey}. Link an issue in ${workspaceUrlKey}, or enter just its ID. If the workspace's URL changed, an admin can update the connection's API key to refresh it.`
    });
  }

  return candidate;
};

const matchAssigneeToRequester = (
  issue: TLinearIssue,
  ctx: TAutoApprovalContext
): NonNullable<TLinearIssueFacts["assignee"]> => {
  const { assignee } = issue;
  if (!assignee) return { matchesRequester: false, reason: `${issue.identifier} isn't assigned to anyone` };

  const assigneeEmail = assignee.email?.trim().toLowerCase();
  if (!assigneeEmail) {
    return {
      matchesRequester: false,
      reason: `Linear doesn't share the email address of ${issue.identifier}'s assignee`
    };
  }

  const email = ctx.requester.email?.trim().toLowerCase();
  return email && assigneeEmail === email
    ? { matchesRequester: true, reason: null }
    : { matchesRequester: false, reason: `${issue.identifier} isn't assigned to the requester` };
};

const isAssigneeChange = (entry: TLinearHistoryEntry) =>
  (entry.fromAssigneeId ?? null) !== (entry.toAssigneeId ?? null);

const readStatusSetter = async (
  conn: TLinearConnection,
  issue: TLinearIssue,
  ctx: TAutoApprovalContext,
  deps: TAutoApprovalProviderDeps
): Promise<NonNullable<TLinearIssueFacts["statusSetter"]>> => {
  const { identifier } = issue;
  const fail = (reason: string) => ({ email: null, reason });

  let history;
  try {
    history = await getLinearIssueHistory(conn, issue.id || identifier, deps.signal);
  } catch (error) {
    logger.warn({ err: error }, `Couldn't read Linear issue history [identifier=${identifier}]`);
    return fail(`Couldn't read the history of ${identifier}: ${getLinearErrorMessage(error)}`);
  }

  const { entries, complete } = history;
  const index = entries.findIndex((entry) => entry.toStateId && entry.toStateId !== entry.fromStateId);
  if (index === -1 && !complete) return fail(`Couldn't find who set the status of ${identifier} in its recent history`);

  // An issue whose status never changed got it when it was created
  const setter = index === -1 ? issue.creator : entries[index].actor;
  if (!setter) {
    const bot = index === -1 ? null : entries[index].botActor?.name;
    return fail(`${identifier}'s status was set by ${bot || "an integration or automation"}, not a person`);
  }

  const email = setter.email?.trim().toLowerCase();
  if (!email) return fail(`Linear doesn't share the email address of whoever set ${identifier}'s status`);
  if (email === ctx.requester.email?.trim().toLowerCase()) {
    return fail(`${identifier}'s status was set by the requester`);
  }
  if (entries.slice(0, index === -1 ? entries.length : index).some(isAssigneeChange)) {
    return fail(`${identifier} was reassigned after its status was set`);
  }

  return { email, reason: null };
};

const testValue = (actual: string | null, values: string[], noun: string): TAutoApprovalTestResult =>
  includesIgnoreCase(values, actual) ? { pass: true } : { pass: false, reason: `${noun} isn't ${anyOf(values)}` };

const toNameOptions = (names: string[]) => names.slice(0, MAX_OPTIONS).map((name) => ({ value: name, label: name }));

export const LINEAR_AUTO_APPROVAL_PROVIDER: TAutoApprovalProvider<TLinearConnection> = {
  app: AppConnection.Linear,
  subjects: {
    [LINEAR_SUBMITTED_ISSUE_SUBJECT]: {
      label: "Linear issue",
      input: {
        label: "Linear issue",
        placeholder: "ENG-123 or a link to the issue",
        parse: parseLinearIssue,
        getUrl: (id, conn) =>
          conn.credentials.workspaceUrlKey
            ? `https://${LINEAR_SITE_HOST}/${encodeURIComponent(conn.credentials.workspaceUrlKey)}/issue/${encodeURIComponent(id)}`
            : `https://${LINEAR_SITE_HOST}/issue/${encodeURIComponent(id)}`
      },
      resolve: async (conn, id, ctx, valuesByConstraint, deps): Promise<TLinearIssueFacts> => {
        if (!id) throw new BadRequestError({ message: "No Linear issue was provided" });

        let issue: TLinearIssue;
        try {
          issue = await getLinearIssue(conn, id, { signal: deps.signal });
        } catch (error) {
          if (isLinearNotFoundError(error)) {
            throw new BadRequestError({
              message: `Linear issue ${id} doesn't exist, or the Linear connection can't see it`
            });
          }
          if (error instanceof BadRequestError) throw error;
          logger.warn({ err: error }, `Couldn't read Linear issue [identifier=${id}]`);
          throw new BadRequestError({ message: `Couldn't read Linear issue ${id}: ${getLinearErrorMessage(error)}` });
        }

        const identifier = issue.identifier || id;
        if (issue.trashed) throw new BadRequestError({ message: `Linear issue ${identifier} is in the trash` });
        if (issue.archivedAt) throw new BadRequestError({ message: `Linear issue ${identifier} is archived` });

        return {
          issueId: issue.id || null,
          identifier,
          status: issue.state?.name ?? null,
          teamKey: issue.team?.key ?? null,
          labels: (issue.labels?.nodes ?? []).map(({ name }) => name).slice(0, MAX_STORED_LABELS),
          assignee: Object.hasOwn(valuesByConstraint, LinearIssueConstraint.AssignedToRequester)
            ? matchAssigneeToRequester({ ...issue, identifier }, ctx)
            : null,
          statusSetter: Object.hasOwn(valuesByConstraint, LinearIssueConstraint.StatusSetBy)
            ? await readStatusSetter(conn, { ...issue, identifier }, ctx, deps)
            : null
        };
      },
      getStableId: (facts: TLinearIssueFacts) => facts.issueId,
      constraints: {
        [LinearIssueConstraint.AssignedToRequester]: {
          label: "is assigned to the requester",
          value: AutoApprovalConstraintValue.None,
          test: (facts: TLinearIssueFacts) =>
            facts.assignee?.matchesRequester
              ? { pass: true }
              : { pass: false, reason: facts.assignee?.reason ?? "Couldn't check the issue's assignee" }
        },
        [LinearIssueConstraint.Status]: {
          label: "has status",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search, siblings }, deps) => {
            const teamKeys = siblings[LinearIssueConstraint.Team] ?? [];
            const statuses = await withOptionsError("statuses", () =>
              listLinearStatuses(conn, { search, teamKeys }, deps.signal)
            );
            return toNameOptions(statuses);
          },
          test: (facts: TLinearIssueFacts, values) => testValue(facts.status, values, "status")
        },
        [LinearIssueConstraint.Team]: {
          label: "is in team",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search, selected }, deps) => {
            const [teams, picked] = await withOptionsError("teams", () =>
              Promise.all([
                listLinearTeams(conn, { search }, deps.signal),
                selected.length
                  ? listLinearTeams(conn, { keys: selected.map((key) => key.toUpperCase()) }, deps.signal)
                  : Promise.resolve([])
              ])
            );
            const byKey = new Map([...picked, ...teams].map((team) => [team.key, team]));
            return [...byKey.values()]
              .slice(0, MAX_OPTIONS)
              .map(({ key, name }) => ({ value: key, label: `${name} (${key})` }));
          },
          test: (facts: TLinearIssueFacts, values) => testValue(facts.teamKey, values, "team")
        },
        [LinearIssueConstraint.Label]: {
          label: "has label",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search }, deps) => {
            const labels = await withOptionsError("labels", () => listLinearLabels(conn, { search }, deps.signal));
            return toNameOptions(labels);
          },
          test: (facts: TLinearIssueFacts, values) => {
            if (facts.labels.some((label) => includesIgnoreCase(values, label))) return { pass: true };
            return { pass: false, reason: `doesn't have label ${anyOf(values)}` };
          }
        },
        [LinearIssueConstraint.StatusSetBy]: {
          label: "had its status set by",
          value: AutoApprovalConstraintValue.Many,
          listOptions: async (conn, { search, selected }, deps) => {
            const [users, picked] = await withOptionsError("users", () =>
              Promise.all([
                listLinearUsers(conn, { search }, deps.signal),
                selected.length ? listLinearUsers(conn, { emails: selected }, deps.signal) : Promise.resolve([])
              ])
            );
            const byEmail = new Map(
              [...picked, ...users].map((user) => [user.email.toLowerCase(), user.name || user.displayName || ""])
            );
            return [...byEmail.entries()].slice(0, MAX_OPTIONS).map(([email, name]) => ({
              value: email,
              label: name && name.toLowerCase() !== email ? `${name} (${email})` : email
            }));
          },
          test: (facts: TLinearIssueFacts, values) => {
            const setter = facts.statusSetter;
            if (!setter?.email) return { pass: false, reason: setter?.reason ?? "Couldn't check who set the status" };
            return includesIgnoreCase(values, setter.email)
              ? { pass: true }
              : { pass: false, reason: `status wasn't set by ${anyOf(values)}` };
          }
        }
      }
    }
  }
};
