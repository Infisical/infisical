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
import { PortainerConnectionMethod, PortainerStackType } from "./portainer-connection-enums";
import {
  TPortainerConnection,
  TPortainerConnectionConfig,
  TPortainerEnvironment,
  TPortainerGatewayDeps,
  TPortainerRequestConfig,
  TPortainerStack,
  TPortainerStackResponse
} from "./portainer-connection-types";

type TPortainerEnvironmentResponse = {
  Id: number;
  Name: string;
};

type TPortainerRequest = {
  method: "GET" | "POST" | "PUT";
  path: string;
  data?: unknown;
  params?: Record<string, string>;
  timeoutMs?: number;
};

export const PORTAINER_REQUEST_TIMEOUT_MS = 30_000;
const PORTAINER_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export const getPortainerInstanceUrl = (config: Pick<TPortainerConnectionConfig, "credentials">) =>
  removeTrailingSlash(config.credentials.instanceUrl);

export const getPortainerConnectionListItem = () => {
  return {
    name: "Portainer" as const,
    app: AppConnection.Portainer as const,
    methods: Object.values(PortainerConnectionMethod) as [PortainerConnectionMethod.ApiToken]
  };
};

// Portainer 2.45 moved the Git settings onto a Source referenced by WorkflowID; older releases only have GitConfig
export const isPortainerGitStack = (stack: Pick<TPortainerStackResponse, "WorkflowID" | "GitConfig">) =>
  Boolean(stack.WorkflowID) || Boolean(stack.GitConfig?.URL);

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

export const getPortainerErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    const body = error.response?.data as { message?: string; details?: string } | undefined;
    const detail = [body?.message, body?.details].filter(Boolean).join(": ");

    if (error.response?.status === 401) return "Portainer rejected the API token";
    if (error.response?.status === 403) {
      return `the API token's user is not allowed to perform this action in Portainer${detail ? ` (${detail})` : ""}`;
    }
    if (detail) return detail;

    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

export const portainerRequest = async <T>(
  config: TPortainerRequestConfig,
  { method, path, data, params, timeoutMs = PORTAINER_REQUEST_TIMEOUT_MS }: TPortainerRequest,
  { gatewayV2Service, gatewayPoolService }: TPortainerGatewayDeps = {}
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = config;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This Portainer connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (gatewayId && !gatewayV2Service) {
    throw new BadRequestError({
      message: "This Portainer connection uses a Gateway, which is not supported on this operation"
    });
  }

  const url = new URL(`${getPortainerInstanceUrl(config)}/api${path}`);
  const headers = {
    "X-API-Key": credentials.apiToken,
    Accept: "application/json",
    ...(data !== undefined && { "Content-Type": "application/json" })
  };

  const baseRequestConfig: AxiosRequestConfig = {
    method,
    params,
    ...(data !== undefined && { data }),
    timeout: timeoutMs,
    maxContentLength: PORTAINER_MAX_RESPONSE_BYTES,
    maxBodyLength: PORTAINER_MAX_RESPONSE_BYTES
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
    throw new BadRequestError({ message: "Unable to connect to the Gateway assigned to this Portainer connection" });
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

export const validatePortainerConnectionCredentials = async (
  config: TPortainerConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await portainerRequest(config, { method: "GET", path: "/users/me" }, { gatewayV2Service });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to validate Portainer connection credentials");
    throw new BadRequestError({
      message: `Unable to validate Portainer connection: ${getPortainerErrorMessage(error, "verify the instance URL and API token")}`
    });
  }

  return config.credentials;
};

export const listPortainerEnvironments = async (
  appConnection: TPortainerConnection,
  deps: TPortainerGatewayDeps = {}
): Promise<TPortainerEnvironment[]> => {
  try {
    // Returns the complete list when the optional start/limit query parameters are omitted
    const environments = await portainerRequest<TPortainerEnvironmentResponse[]>(
      appConnection,
      { method: "GET", path: "/endpoints" },
      deps
    );

    return environments.map((environment) => ({ id: environment.Id, name: environment.Name }));
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to list Portainer environments");
    throw new BadRequestError({
      message: `Failed to list Portainer environments: ${getPortainerErrorMessage(error, "verify the instance URL and API token")}`
    });
  }
};

export const listPortainerStacks = async (
  appConnection: TPortainerConnection,
  deps: TPortainerGatewayDeps = {}
): Promise<TPortainerStack[]> => {
  try {
    // The stack list endpoint is not paginated
    const stacks = await portainerRequest<TPortainerStackResponse[]>(
      appConnection,
      { method: "GET", path: "/stacks" },
      deps
    );

    return (
      stacks
        // Portainer ignores `env` when updating a Kubernetes stack, so syncing to one would silently do nothing
        .filter((stack) => stack.Type !== PortainerStackType.Kubernetes)
        .map((stack) => ({
          id: stack.Id,
          name: stack.Name,
          environmentId: stack.EndpointId,
          isGitBased: isPortainerGitStack(stack)
        }))
    );
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to list Portainer stacks");
    throw new BadRequestError({
      message: `Failed to list Portainer stacks: ${getPortainerErrorMessage(error, "verify the instance URL and API token")}`
    });
  }
};
