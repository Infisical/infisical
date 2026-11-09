import { AxiosRequestConfig, isAxiosError } from "axios";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { getSharedHttpsAgent, safeRequest } from "@app/lib/validator/safe-request";

import { AppConnection } from "../app-connection-enums";
import { JenkinsConnectionMethod } from "./jenkins-connection-enums";
import {
  TJenkinsConnection,
  TJenkinsConnectionConfig,
  TJenkinsFolder,
  TJenkinsGatewayDeps,
  TJenkinsRequestConfig
} from "./jenkins-connection-types";

type TJenkinsRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  data?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type TJenkinsItemResponse = {
  name: string;
  fullName?: string;
  jobs?: TJenkinsItemResponse[];
};

export const JENKINS_REQUEST_TIMEOUT_MS = 30_000;
const JENKINS_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const JENKINS_MAX_FOLDER_DEPTH = 10;

export const getJenkinsInstanceUrl = (config: Pick<TJenkinsConnectionConfig, "credentials">) =>
  removeTrailingSlash(config.credentials.instanceUrl);

export const getJenkinsConnectionListItem = () => {
  return {
    name: "Jenkins" as const,
    app: AppConnection.Jenkins as const,
    methods: Object.values(JenkinsConnectionMethod) as [JenkinsConnectionMethod.ApiToken]
  };
};

const toLoggableError = (error: unknown) => {
  if (isAxiosError(error)) {
    return {
      name: error.name,
      code: error.code,
      status: error.response?.status,
      message: error.message,
      url: error.config?.url ? sanitizeUrlForLog(error.config.url) : undefined,
      stack: error.stack
    };
  }

  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };

  return { message: String(error) };
};

export const getJenkinsErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 401) return "Jenkins rejected the username or API token";
    if (status === 403) return "the Jenkins user is missing a permission this action requires";
    if (status === 404) {
      return "Jenkins could not find the requested resource. Check the instance URL, including any context path such as /jenkins, and that the user has Job/Read and Credentials/View on the target";
    }
    if (status && status >= 300 && status < 400) {
      return "Jenkins redirected the request. Use the exact instance URL, with https and any context path such as /jenkins";
    }

    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

export const jenkinsRequest = async <T>(
  config: TJenkinsRequestConfig,
  { method, path, data, params, headers: extraHeaders, timeoutMs = JENKINS_REQUEST_TIMEOUT_MS }: TJenkinsRequest,
  { gatewayV2Service, gatewayPoolService }: TJenkinsGatewayDeps = {}
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = config;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This Jenkins connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (gatewayId && !gatewayV2Service) {
    throw new BadRequestError({
      message: "This Jenkins connection uses a Gateway, which is not supported on this operation"
    });
  }

  const url = new URL(`${getJenkinsInstanceUrl(config)}${path}`);
  // An API token authenticates through the Basic header, which also exempts the request from
  // Jenkins' CSRF crumb check, so no crumb or session cookie is needed for writes.
  const headers = {
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.apiToken}`).toString("base64")}`,
    Accept: "application/json",
    ...extraHeaders
  };

  const baseRequestConfig: AxiosRequestConfig = {
    method,
    params,
    ...(data !== undefined && { data }),
    timeout: timeoutMs,
    maxContentLength: JENKINS_MAX_RESPONSE_BYTES,
    maxBodyLength: JENKINS_MAX_RESPONSE_BYTES
  };

  if (!gatewayId || !gatewayV2Service) {
    // URL validation and private-IP blocking happen inside `safeRequest`, which also pins the
    // connection to the validated IPs so DNS rebinding cannot redirect the request after the check
    const { data: responseData } = await safeRequest.request<T>({
      ...baseRequestConfig,
      url: url.toString(),
      headers
    });

    return responseData;
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
    throw new BadRequestError({ message: "Unable to connect to the Gateway assigned to this Jenkins connection" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const proxiedUrl = new URL(url.toString());
      proxiedUrl.host = `localhost:${proxyPort}`;

      const { data: responseData } = await request.request<T>({
        ...baseRequestConfig,
        url: proxiedUrl.toString(),
        headers: { ...headers, Host: url.host },
        maxRedirects: 0,
        ...(isHttps && {
          httpsAgent: getSharedHttpsAgent({ servername: targetHost, rejectUnauthorized: true })
        })
      });

      return responseData;
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      ...platformConnectionDetails
    }
  );
};

export const validateJenkinsConnectionCredentials = async (
  config: TJenkinsConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  let user: { id?: string } | undefined;

  try {
    // /me needs an authenticated user with Overall/Read, unlike /whoAmI, which answers anonymous requests
    user = await jenkinsRequest<{ id?: string }>(
      config,
      { method: "GET", path: "/me/api/json", params: { tree: "id" } },
      { gatewayV2Service }
    );
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to validate Jenkins connection credentials");
    throw new BadRequestError({
      message: `Unable to validate Jenkins connection: ${getJenkinsErrorMessage(error, "verify the instance URL, username and API token")}`
    });
  }

  if (!user?.id) {
    throw new BadRequestError({
      message:
        "Unable to validate Jenkins connection: the instance URL did not respond like a Jenkins server. Check the URL, including any context path such as /jenkins"
    });
  }

  return config.credentials;
};

// The tree parameter cannot recurse, so each level is spelled out. The innermost level asks only for
// names, which shows whether a folder at the depth limit has anything below it.
const getFolderTreeQuery = (depth: number): string =>
  depth === 0 ? "jobs[name]" : `jobs[name,fullName,${getFolderTreeQuery(depth - 1)}]`;

export const listJenkinsFolders = async (
  appConnection: TJenkinsConnection,
  deps: TJenkinsGatewayDeps = {}
): Promise<TJenkinsFolder[]> => {
  let root: TJenkinsItemResponse;

  try {
    // Jenkins returns every item the user can read in one response; the item API is not paginated
    root = await jenkinsRequest<TJenkinsItemResponse>(
      appConnection,
      { method: "GET", path: "/api/json", params: { tree: getFolderTreeQuery(JENKINS_MAX_FOLDER_DEPTH) } },
      deps
    );
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), `Failed to list Jenkins folders [appConnectionId=${appConnection.id}]`);
    throw new BadRequestError({
      message: `Failed to list Jenkins folders: ${getJenkinsErrorMessage(error, "verify the instance URL, username and API token")}`
    });
  }

  const folders: TJenkinsFolder[] = [];
  let isTruncated = false;

  // Folders, organization folders and multibranch projects all expose their children as `jobs` and
  // each has its own credential store, while plain jobs have no `jobs` field at all.
  const collectFolders = (items: TJenkinsItemResponse[] = [], depth = 1) => {
    items.forEach((item) => {
      if (!Array.isArray(item.jobs) || !item.fullName) return;

      folders.push({ name: item.name, fullName: item.fullName });

      if (depth === JENKINS_MAX_FOLDER_DEPTH) {
        if (item.jobs.length) isTruncated = true;
        return;
      }

      collectFolders(item.jobs, depth + 1);
    });
  };

  collectFolders(root.jobs);

  if (isTruncated) {
    logger.warn(
      { appConnectionId: appConnection.id },
      `Jenkins folders nested deeper than ${JENKINS_MAX_FOLDER_DEPTH} levels were not listed [appConnectionId=${appConnection.id}]`
    );
  }

  return folders.sort((a, b) => a.fullName.localeCompare(b.fullName));
};
