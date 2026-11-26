import { isAxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LinearConnectionMethod } from "./linear-connection-enums";
import { TLinearConnectionConfig, TLinearIssue, TLinearTeam, TLinearUser } from "./linear-connection-types";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const LINEAR_REQUEST_TIMEOUT_MS = 15_000;
const LINEAR_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const LINEAR_PAGE_SIZE = 250;
const LINEAR_MAX_PAGES = 4;
const LINEAR_MAX_ERROR_DETAIL_LENGTH = 300;

export const LINEAR_SITE_HOST = "linear.app";
export const LINEAR_ISSUE_IDENTIFIER_REGEX = new RE2("^[A-Z][A-Z0-9_]*-[1-9][0-9]*$");

type TLinearRequestConfig = Pick<TLinearConnectionConfig, "credentials">;

type TLinearGraphqlError = { message?: string; extensions?: { code?: string; userPresentableMessage?: string } };

export class LinearGraphqlError extends Error {
  code: string | null;

  constructor(error: TLinearGraphqlError) {
    super(error.extensions?.userPresentableMessage || error.message || "Linear returned an error");
    this.name = "LinearGraphqlError";
    this.code = error.extensions?.code ?? null;
  }
}

export const getLinearConnectionListItem = () => ({
  name: "Linear" as const,
  app: AppConnection.Linear as const,
  methods: Object.values(LinearConnectionMethod) as [LinearConnectionMethod.ApiKey]
});

const BEARER_PREFIX = "bearer ";
const toAuthorizationHeader = (apiKey: string) => {
  const trimmed = apiKey.trim();
  return trimmed.toLowerCase().startsWith(BEARER_PREFIX) ? trimmed.slice(BEARER_PREFIX.length).trim() : trimmed;
};

const readGraphqlErrors = (data: unknown) => {
  const errors = (data as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? (errors as TLinearGraphqlError[]) : [];
};

const linearGraphql = async <T>(
  config: TLinearRequestConfig,
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal
) => {
  try {
    const { data } = await request.post<{ data?: T; errors?: TLinearGraphqlError[] }>(
      LINEAR_API_URL,
      { query, variables },
      {
        // Personal API keys go in the header as is, without a Bearer prefix
        headers: {
          Authorization: toAuthorizationHeader(config.credentials.apiKey),
          "Content-Type": "application/json"
        },
        timeout: LINEAR_REQUEST_TIMEOUT_MS,
        maxContentLength: LINEAR_MAX_RESPONSE_BYTES,
        signal
      }
    );

    const [firstError] = readGraphqlErrors(data);
    if (firstError) throw new LinearGraphqlError(firstError);
    if (!data?.data) throw new LinearGraphqlError({ message: "Linear returned no data" });
    return data.data;
  } catch (error) {
    // Linear answers most failures with a 400 that carries GraphQL errors
    if (isAxiosError(error)) {
      const [firstError] = readGraphqlErrors(error.response?.data);
      if (firstError) throw new LinearGraphqlError(firstError);
      logger.warn(
        { code: error.code, status: error.response?.status, message: error.message },
        "Linear request failed"
      );
    } else if (!(error instanceof LinearGraphqlError)) {
      logger.warn({ err: error }, "Linear request failed");
    }
    throw error;
  }
};

// Linear reports a missing issue as a generic INPUT_ERROR, so only the message identifies it
const LINEAR_NOT_FOUND_MESSAGES = ["could not find referenced", "entity not found"];

export const isLinearNotFoundError = (error: unknown) =>
  error instanceof LinearGraphqlError &&
  LINEAR_NOT_FOUND_MESSAGES.some((message) => error.message.toLowerCase().includes(message));

export const getLinearErrorMessage = (error: unknown) => {
  if (error instanceof BadRequestError) return error.message;

  if (error instanceof LinearGraphqlError) {
    if (error.code === "AUTHENTICATION_ERROR") return "Linear rejected the connection's API key";
    if (error.code === "FORBIDDEN") return "The connection's Linear API key doesn't have permission for this";
    if (error.code === "RATELIMITED") return "Linear is rate limiting the connection's API key";
    if (isLinearNotFoundError(error)) return error.message.slice(0, LINEAR_MAX_ERROR_DETAIL_LENGTH);
    return error.code ? `Linear returned an error (${error.code})` : "Linear returned an error";
  }

  if (isAxiosError(error)) {
    if (error.code === "ERR_CANCELED") return "The check ran out of time before Linear answered";
    if (error.message.includes("maxContentLength")) return "Linear's response was too large to read";
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return `Linear did not respond within ${LINEAR_REQUEST_TIMEOUT_MS / 1000} seconds`;
    }

    const status = error.response?.status;
    if (status === 401) return "Linear rejected the connection's API key";
    if (status === 429) return "Linear is rate limiting the connection's API key";
    if (status) return `Linear responded with status ${status}`;
    if (error.code) return `Couldn't reach Linear (${error.code})`;
  }

  return "Couldn't reach Linear";
};

export const validateLinearConnectionCredentials = async (config: TLinearConnectionConfig) => {
  let workspaceId: string | undefined;
  let workspaceUrlKey: string | undefined;
  try {
    const data = await linearGraphql<{ viewer?: { id: string }; organization?: { id?: string; urlKey?: string } }>(
      config,
      "query { viewer { id } organization { id urlKey } }",
      {}
    );
    workspaceId = data.organization?.id || undefined;
    workspaceUrlKey = data.organization?.urlKey || undefined;
  } catch (error) {
    const rejected =
      (error instanceof LinearGraphqlError && error.code === "AUTHENTICATION_ERROR") ||
      (isAxiosError(error) && error.response?.status === 401);
    throw new BadRequestError({
      message: rejected
        ? "Unable to validate connection: Linear didn't accept this API key. Check that you copied the whole personal API key and that it hasn't been revoked."
        : `Unable to validate connection: ${getLinearErrorMessage(error)}`
    });
  }

  return { ...config.credentials, workspaceId, workspaceUrlKey };
};

const ISSUE_FIELDS = `
  id
  identifier
  url
  title
  description
  priorityLabel
  createdAt
  updatedAt
  archivedAt
  trashed
  state { name type }
  team { key name }
  project { name }
  assignee { id name displayName email active }
  creator { id name displayName email active }
  labels(first: 100) { nodes { name } }
`;

export const getLinearIssue = async (
  config: TLinearRequestConfig,
  identifier: string,
  { signal, commentCount = 0 }: { signal?: AbortSignal; commentCount?: number } = {}
) => {
  const comments = commentCount
    ? `comments(last: ${commentCount}) { nodes { body createdAt user { id name displayName email } } }`
    : "";
  const data = await linearGraphql<{ issue?: TLinearIssue | null }>(
    config,
    `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} ${comments} } }`,
    { id: identifier },
    signal
  );
  if (!data.issue) throw new LinearGraphqlError({ message: "Entity not found: Issue" });
  return data.issue;
};

export const searchLinearIssues = async (
  config: TLinearRequestConfig,
  { term, first }: { term: string; first: number },
  signal?: AbortSignal
) => {
  const data = await linearGraphql<{
    searchIssues?: { nodes: TLinearIssue[]; pageInfo?: { hasNextPage?: boolean } };
  }>(
    config,
    `query Search($term: String!, $first: Int!) {
      searchIssues(term: $term, first: $first) {
        nodes { id identifier url title updatedAt state { name type } team { key name } assignee { name displayName email } }
        pageInfo { hasNextPage }
      }
    }`,
    { term, first },
    signal
  );
  return { issues: data.searchIssues?.nodes ?? [], hasMore: Boolean(data.searchIssues?.pageInfo?.hasNextPage) };
};

export const findLinearUsersByEmail = async (config: TLinearRequestConfig, email: string, signal?: AbortSignal) => {
  const data = await linearGraphql<{ users?: { nodes: TLinearUser[] } }>(
    config,
    `query Users($email: String!) {
      users(filter: { email: { eqIgnoreCase: $email } }, includeDisabled: true) {
        nodes { id name displayName email active }
      }
    }`,
    { email },
    signal
  );
  return data.users?.nodes ?? [];
};

const filterTypeByField: Record<string, string> = {
  teams: "TeamFilter",
  workflowStates: "WorkflowStateFilter",
  issueLabels: "IssueLabelFilter"
};

const listAllPages = async <T>(
  config: TLinearRequestConfig,
  field: string,
  selection: string,
  filter: Record<string, unknown> | null,
  signal?: AbortSignal
) => {
  const nodes: T[] = [];
  let after: string | null = null;
  let page = 0;
  let hasNextPage = false;

  do {
    const data: Record<string, { nodes: T[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }> =
      // eslint-disable-next-line no-await-in-loop
      await linearGraphql(
        config,
        `query List($first: Int!, $after: String${filter ? `, $filter: ${filterTypeByField[field]}` : ""}) {
          ${field}(first: $first, after: $after${filter ? ", filter: $filter" : ""}) {
            nodes { ${selection} }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first: LINEAR_PAGE_SIZE, after, ...(filter ? { filter } : {}) },
        signal
      );

    const connection = data[field];
    nodes.push(...(connection?.nodes ?? []));
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor ?? null;
    page += 1;
  } while (hasNextPage && after && page < LINEAR_MAX_PAGES);

  return nodes;
};

const nameFilter = (search?: string) => (search ? { name: { containsIgnoreCase: search } } : null);

export const listLinearTeams = async (
  config: TLinearRequestConfig,
  { search, keys }: { search?: string; keys?: string[] } = {},
  signal?: AbortSignal
) => {
  let filter: Record<string, unknown> | null = null;
  if (keys?.length) filter = { key: { in: keys } };
  else if (search) filter = { or: [{ name: { containsIgnoreCase: search } }, { key: { containsIgnoreCase: search } }] };
  return listAllPages<TLinearTeam>(config, "teams", "key name", filter, signal);
};

export const listLinearStatuses = async (
  config: TLinearRequestConfig,
  { search, teamKeys }: { search?: string; teamKeys: string[] },
  signal?: AbortSignal
) => {
  const filter = {
    ...nameFilter(search),
    ...(teamKeys.length ? { team: { key: { in: teamKeys.map((key) => key.toUpperCase()) } } } : {})
  };
  const states = await listAllPages<{ name: string }>(
    config,
    "workflowStates",
    "name",
    Object.keys(filter).length ? filter : null,
    signal
  );
  return [...new Set(states.map(({ name }) => name))].sort((a, b) => a.localeCompare(b));
};

export const listLinearLabels = async (
  config: TLinearRequestConfig,
  { search }: { search?: string } = {},
  signal?: AbortSignal
) => {
  const labels = await listAllPages<{ name: string }>(
    config,
    "issueLabels",
    "name",
    { ...nameFilter(search), isGroup: { eq: false } },
    signal
  );
  return [...new Set(labels.map(({ name }) => name))].sort((a, b) => a.localeCompare(b));
};
