import { AxiosError, AxiosRequestConfig, isAxiosError } from "axios";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { DiscriminativePick } from "@app/lib/types";
import { getSharedHttpsAgent, safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { JiraConnectionMethod } from "./jira-connection-enums";
import { TJiraApproval, TJiraConnectionConfig, TJiraIssue, TJiraNamedOption, TJiraUser } from "./jira-connection-types";

export const JIRA_REQUEST_TIMEOUT_MS = 15_000;
const JIRA_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const JIRA_PAGE_SIZE = 50;
const JIRA_MAX_PAGES = 10;
const JIRA_MAX_ERROR_DETAIL_LENGTH = 300;

export type TJiraGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "runWithPoolFailover">;
  signal?: AbortSignal;
};

export type TJiraRequestConfig = DiscriminativePick<
  TJiraConnectionConfig,
  "method" | "credentials" | "gatewayId" | "gatewayPoolId"
>;

type TJiraRequest = {
  path: string;
  params?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

export const getJiraConnectionListItem = () => ({
  name: "Jira" as const,
  app: AppConnection.Jira as const,
  methods: Object.values(JiraConnectionMethod) as [
    JiraConnectionMethod.ApiToken,
    JiraConnectionMethod.PersonalAccessToken
  ]
});

export const isJiraCloud = (config: Pick<TJiraConnectionConfig, "method">) =>
  config.method === JiraConnectionMethod.ApiToken;

// Jira Data Center only serves v2 of the REST API
const getJiraRestApiPath = (config: Pick<TJiraConnectionConfig, "method">) =>
  isJiraCloud(config) ? "/rest/api/3" : "/rest/api/2";

const getJiraAuthorizationHeader = (config: TJiraRequestConfig) => {
  if (config.method === JiraConnectionMethod.ApiToken) {
    const { email, apiToken } = config.credentials;
    return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  }

  return `Bearer ${config.credentials.personalAccessToken}`;
};

const getJiraTlsOptions = (config: TJiraRequestConfig) => {
  if (config.method === JiraConnectionMethod.PersonalAccessToken) {
    return {
      ca: config.credentials.sslCertificate,
      rejectUnauthorized: config.credentials.sslRejectUnauthorized ?? true
    };
  }

  return { ca: undefined, rejectUnauthorized: true };
};

export const jiraRequest = async <T>(
  config: TJiraRequestConfig,
  { path, params, headers: extraHeaders }: TJiraRequest,
  { gatewayV2Service, gatewayPoolService, signal }: TJiraGatewayDeps = {}
): Promise<T> => {
  const { gatewayId: directGatewayId, gatewayPoolId } = config;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This Jira connection uses a gateway pool, which is not supported on this operation"
    });
  }

  const url = new URL(`${removeTrailingSlash(config.credentials.instanceUrl)}${path}`);
  const headers = { Authorization: getJiraAuthorizationHeader(config), Accept: "application/json", ...extraHeaders };
  const { ca, rejectUnauthorized } = getJiraTlsOptions(config);

  const baseRequestConfig: AxiosRequestConfig = {
    method: "GET",
    params,
    timeout: JIRA_REQUEST_TIMEOUT_MS,
    maxContentLength: JIRA_MAX_RESPONSE_BYTES,
    signal
  };

  const requestThroughGateway = async (gatewayId: string) => {
    // a pinned gateway must never fall through to the direct request below
    if (!gatewayV2Service) {
      throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    }

    const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
    const isHttps = url.protocol === "https:";
    const targetPort = url.port ? Number(url.port) : (isHttps && 443) || 80;

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort
    });

    if (!platformConnectionDetails) {
      throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    }

    const outcome = await withGatewayV2Proxy<{ data: T } | { error: AxiosError }>(
      async (proxyPort) => {
        const proxiedUrl = new URL(url.toString());
        proxiedUrl.host = `localhost:${proxyPort}`;

        try {
          const { data } = await request.request<T>({
            ...baseRequestConfig,
            url: proxiedUrl.toString(),
            headers: { ...headers, Host: url.host },
            maxRedirects: 0,
            ...(isHttps && {
              httpsAgent: getSharedHttpsAgent({ servername: targetHost, ca, rejectUnauthorized })
            })
          });
          return { data };
        } catch (error) {
          // The proxy reduces a thrown error to its message, so Jira's own responses are passed out whole
          if (isAxiosError(error) && error.response) return { error };
          throw error;
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        ...platformConnectionDetails
      }
    );

    if ("error" in outcome) throw outcome.error;
    return outcome.data;
  };

  if (gatewayPoolId && gatewayPoolService) {
    const { result } = await gatewayPoolService.runWithPoolFailover(
      { poolId: gatewayPoolId, gatewayId: directGatewayId },
      requestThroughGateway
    );
    return result;
  }

  if (directGatewayId) return requestThroughGateway(directGatewayId);

  const { data } = await safeRequest.request<T>({
    ...baseRequestConfig,
    url: url.toString(),
    headers,
    ca,
    rejectUnauthorized
  });

  return data;
};

export const isJiraNotFoundError = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

export const getJiraErrorMessage = (error: unknown) => {
  if (error instanceof BadRequestError || error instanceof NotFoundError) return error.message;

  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return `Jira did not respond within ${JIRA_REQUEST_TIMEOUT_MS / 1000} seconds`;
    }

    const status = error.response?.status;
    if (status === 401) return "Jira rejected the connection's credentials";
    if (status === 403) return "The connection's Jira account doesn't have permission for this";
    if (status && status >= 300 && status < 400) {
      return "Jira redirected the request, so the instance URL is likely wrong. Use your Jira site's base URL";
    }

    const body = error.response?.data as { errorMessages?: unknown[]; errors?: Record<string, unknown> } | undefined;
    const detail = [...(body?.errorMessages ?? []), ...Object.values(body?.errors ?? {})].find(
      (message): message is string => typeof message === "string" && Boolean(message.trim())
    );
    if (detail) return detail.slice(0, JIRA_MAX_ERROR_DETAIL_LENGTH);

    if (status) return `Jira responded with status ${status}`;
    if (error.code) return `Couldn't reach Jira (${error.code})`;
  }

  return "Couldn't reach Jira";
};

const logJiraError = (error: unknown, action: string) => {
  logger.error(
    {
      status: isAxiosError(error) ? error.response?.status : undefined,
      code: isAxiosError(error) ? error.code : undefined,
      url: isAxiosError(error) && error.config?.url ? sanitizeUrlForLog(error.config.url) : undefined,
      message: error instanceof Error ? error.message : String(error)
    },
    `Jira request failed [action=${action}]`
  );
};

export const validateJiraConnectionCredentials = async (
  config: TJiraConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  let myself: TJiraUser | undefined;

  try {
    myself = await jiraRequest<TJiraUser>(
      config,
      { path: `${getJiraRestApiPath(config)}/myself` },
      { gatewayV2Service }
    );
  } catch (error) {
    if (error instanceof NotFoundError) throw error;

    logJiraError(error, "validate-credentials");

    // A failure past the gateway arrives as a bare message, such as "socket hang up"
    if (error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Unable to validate connection: ${config.gatewayId ? "couldn't reach Jira through the gateway: " : ""}${error.message}`
      });
    }

    if (isJiraNotFoundError(error)) {
      throw new BadRequestError({
        message: `Unable to validate connection: Jira returned 404. Verify the instance URL points to your Jira site, and use ${
          isJiraCloud(config) ? "a personal access token for Jira Data Center" : "an API token for Jira Cloud"
        } if that is what you are connecting to.`
      });
    }

    if (isAxiosError(error) && error.response?.status === 401) {
      throw new BadRequestError({
        message: isJiraCloud(config)
          ? "Unable to validate connection: Jira rejected the email and API token. Check both, and use a personal access token instead if this is Jira Data Center."
          : "Unable to validate connection: Jira rejected the personal access token. Check that it hasn't expired or been revoked."
      });
    }

    throw new BadRequestError({ message: `Unable to validate connection: ${getJiraErrorMessage(error)}` });
  }

  if (!myself || typeof myself !== "object" || !(myself.accountId || myself.key || myself.name)) {
    throw new BadRequestError({
      message:
        "Unable to validate connection: the instance URL did not return a Jira user. Verify it points to your Jira site."
    });
  }

  return config.credentials;
};

export const getJiraIssue = async (
  config: TJiraRequestConfig,
  issueKey: string,
  fields: string[],
  deps: TJiraGatewayDeps
) =>
  jiraRequest<TJiraIssue>(
    config,
    {
      path: `${getJiraRestApiPath(config)}/issue/${encodeURIComponent(issueKey)}`,
      params: { fields: fields.join(",") }
    },
    deps
  );

const matchesSearch = (search: string | undefined, ...values: string[]) => {
  if (!search) return true;
  const needle = search.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
};

const dedupeByName = (options: TJiraNamedOption[]) => {
  const byName = new Map<string, TJiraNamedOption>();
  options.forEach((option) => {
    const key = option.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, option);
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const listJiraProjects = async (
  config: TJiraRequestConfig,
  { search }: { search?: string },
  deps: TJiraGatewayDeps
): Promise<{ key: string; name: string }[]> => {
  if (!isJiraCloud(config)) {
    // Data Center returns every visible project in one response
    const projects = await jiraRequest<{ key: string; name: string }[]>(
      config,
      { path: `${getJiraRestApiPath(config)}/project` },
      deps
    );
    return (Array.isArray(projects) ? projects : [])
      .filter((project) => matchesSearch(search, project.key, project.name))
      .map(({ key, name }) => ({ key, name }));
  }

  const projects: { key: string; name: string }[] = [];
  let startAt = 0;
  let isLast = false;
  let page = 0;

  while (!isLast && page < JIRA_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const data = await jiraRequest<{ values?: { key: string; name: string }[]; isLast?: boolean }>(
      config,
      {
        path: `${getJiraRestApiPath(config)}/project/search`,
        params: { query: search || undefined, startAt, maxResults: JIRA_PAGE_SIZE, orderBy: "key" }
      },
      deps
    );
    const values = data?.values ?? [];
    projects.push(...values.map(({ key, name }) => ({ key, name })));
    isLast = data?.isLast ?? values.length < JIRA_PAGE_SIZE;
    startAt += values.length;
    page += 1;
  }

  if (!isLast) {
    logger.warn(`listJiraProjects: stopped after ${JIRA_MAX_PAGES} pages [projects=${projects.length}]`);
  }

  return projects;
};

export const listJiraStatuses = async (
  config: TJiraRequestConfig,
  { projectKeys }: { projectKeys: string[] },
  deps: TJiraGatewayDeps
): Promise<TJiraNamedOption[]> => {
  const apiPath = getJiraRestApiPath(config);

  if (!projectKeys.length) {
    const statuses = await jiraRequest<TJiraNamedOption[]>(config, { path: `${apiPath}/status` }, deps);
    return dedupeByName(Array.isArray(statuses) ? statuses : []);
  }

  const perProject = await Promise.all(
    projectKeys.map((projectKey) =>
      jiraRequest<{ statuses?: TJiraNamedOption[] }[]>(
        config,
        { path: `${apiPath}/project/${encodeURIComponent(projectKey)}/statuses` },
        deps
      )
    )
  );

  return dedupeByName(
    perProject.flatMap((issueTypes) => (Array.isArray(issueTypes) ? issueTypes : [])).flatMap((t) => t.statuses ?? [])
  );
};

export const listJiraIssueTypes = async (
  config: TJiraRequestConfig,
  { projectKeys }: { projectKeys: string[] },
  deps: TJiraGatewayDeps
): Promise<TJiraNamedOption[]> => {
  const apiPath = getJiraRestApiPath(config);

  if (!projectKeys.length) {
    const issueTypes = await jiraRequest<TJiraNamedOption[]>(config, { path: `${apiPath}/issuetype` }, deps);
    return dedupeByName(Array.isArray(issueTypes) ? issueTypes : []);
  }

  const projects = await Promise.all(
    projectKeys.map((projectKey) =>
      jiraRequest<{ issueTypes?: TJiraNamedOption[] }>(
        config,
        { path: `${apiPath}/project/${encodeURIComponent(projectKey)}` },
        deps
      )
    )
  );

  return dedupeByName(projects.flatMap((project) => project?.issueTypes ?? []));
};

export const searchJiraLabels = async (
  config: TJiraRequestConfig,
  { search }: { search?: string },
  deps: TJiraGatewayDeps
): Promise<string[]> => {
  const data = await jiraRequest<{ results?: { value?: string }[] }>(
    config,
    {
      path: `${getJiraRestApiPath(config)}/jql/autocompletedata/suggestions`,
      params: { fieldName: "labels", fieldValue: search ?? "" }
    },
    deps
  );

  return [...new Set((data?.results ?? []).map((result) => result.value).filter((value): value is string => !!value))];
};

export const findJiraUsersByEmail = async (
  config: TJiraRequestConfig,
  email: string,
  deps: TJiraGatewayDeps
): Promise<TJiraUser[]> => {
  const users = await jiraRequest<TJiraUser[]>(
    config,
    {
      path: `${getJiraRestApiPath(config)}/user/search`,
      // Cloud matches query against display names and emails; Data Center matches username against both
      params: isJiraCloud(config) ? { query: email, maxResults: 20 } : { username: email, maxResults: 20 }
    },
    deps
  );

  return Array.isArray(users) ? users : [];
};

// Jira Service Management approvals, which only an approver can decide, unlike an issue's status
export const listJiraIssueApprovals = async (
  config: TJiraRequestConfig,
  issueKey: string,
  deps: TJiraGatewayDeps
): Promise<TJiraApproval[]> => {
  const approvals: TJiraApproval[] = [];
  let start = 0;
  let isLastPage = false;
  let page = 0;

  while (!isLastPage && page < JIRA_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const data = await jiraRequest<{ values?: TJiraApproval[]; isLastPage?: boolean }>(
      config,
      {
        path: `/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/approval`,
        params: { start, limit: JIRA_PAGE_SIZE },
        // Data Center rejects this experimental endpoint without the opt-in header
        headers: { "X-ExperimentalApi": "opt-in" }
      },
      deps
    );
    const values = data?.values ?? [];
    approvals.push(...values);
    isLastPage = data?.isLastPage ?? values.length < JIRA_PAGE_SIZE;
    start += values.length;
    page += 1;
  }

  // The newest decision could be on a page that wasn't read
  if (!isLastPage) {
    throw new BadRequestError({ message: `${issueKey} has more Jira approvals than Infisical can read` });
  }

  return approvals;
};
