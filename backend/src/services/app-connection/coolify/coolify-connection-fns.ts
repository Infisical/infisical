import { AxiosError, AxiosRequestConfig, isAxiosError } from "axios";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { getSharedHttpsAgent, safeRequest } from "@app/lib/validator/safe-request";

import { AppConnection } from "../app-connection-enums";
import { CoolifyConnectionMethod, CoolifyResourceType } from "./coolify-connection-enums";
import {
  TCoolifyConnection,
  TCoolifyConnectionConfig,
  TCoolifyGatewayDeps,
  TCoolifyRequestConfig,
  TCoolifyResource
} from "./coolify-connection-types";

type TCoolifyRequest = {
  method: "GET" | "PATCH" | "DELETE";
  path: string;
  data?: unknown;
};

type TCoolifyApiResource = { uuid: string; name: string; type: string; environment_id: number };

type TCoolifyApiProject = { uuid: string; name: string };

type TCoolifyApiEnvironment = { id: number; name: string };

const COOLIFY_REQUEST_TIMEOUT_MS = 30_000;
const COOLIFY_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export const getCoolifyConnectionListItem = () => {
  return {
    name: "Coolify" as const,
    app: AppConnection.Coolify as const,
    methods: Object.values(CoolifyConnectionMethod) as [CoolifyConnectionMethod.ApiToken]
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

export const getCoolifyErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError<{ message?: unknown }>(error)) {
    const status = error.response?.status;

    if (status === 401)
      return "Coolify rejected the API token. Check that it hasn't expired, been paused or been revoked";
    if (status && status >= 300 && status < 400) {
      return "Coolify redirected the request. Use the exact instance URL, with https";
    }

    // Coolify explains most refusals in the body, such as a missing token permission or the API being disabled
    const message = error.response?.data?.message;
    if (typeof message === "string" && message) return message;

    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

// Resolved once so every request in an operation goes through the same pool member
export const resolveCoolifyGateway = async (
  connection: TCoolifyConnection,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<TCoolifyConnection> => ({
  ...connection,
  gatewayId: await gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId
  }),
  gatewayPoolId: null
});

export const coolifyRequest = async <T>(
  config: TCoolifyRequestConfig,
  { method, path, data }: TCoolifyRequest,
  { gatewayV2Service, gatewayPoolService }: TCoolifyGatewayDeps = {}
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = config;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This Coolify connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (gatewayId && !gatewayV2Service) {
    throw new BadRequestError({
      message: "This Coolify connection uses a Gateway, which is not supported on this operation"
    });
  }

  const url = new URL(`${removeTrailingSlash(credentials.instanceUrl)}/api/v1${path}`);
  const headers = {
    Authorization: `Bearer ${credentials.apiToken}`,
    Accept: "application/json"
  };

  const baseRequestConfig: AxiosRequestConfig = {
    method,
    ...(data !== undefined && { data }),
    timeout: COOLIFY_REQUEST_TIMEOUT_MS,
    maxContentLength: COOLIFY_MAX_RESPONSE_BYTES,
    maxBodyLength: COOLIFY_MAX_RESPONSE_BYTES
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
    throw new BadRequestError({ message: "Unable to connect to the Gateway assigned to this Coolify connection" });
  }

  const result = await withGatewayV2Proxy<{ responseData: T } | { coolifyError: AxiosError }>(
    async (proxyPort) => {
      const proxiedUrl = new URL(url.toString());
      proxiedUrl.host = `localhost:${proxyPort}`;

      try {
        const { data: responseData } = await request.request<T>({
          ...baseRequestConfig,
          url: proxiedUrl.toString(),
          headers: { ...headers, Host: url.host },
          maxRedirects: 0,
          ...(isHttps && {
            httpsAgent: getSharedHttpsAgent({ servername: targetHost, rejectUnauthorized: true })
          })
        });

        return { responseData };
      } catch (error) {
        // The proxy turns an error thrown here into a BadRequestError without the status code, which callers need
        // to tell a missing resource or a refused token apart, so Coolify's answer is carried out of the tunnel
        if (isAxiosError(error) && error.response) return { coolifyError: error };
        throw error;
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      ...platformConnectionDetails
    }
  );

  if ("coolifyError" in result) throw result.coolifyError;

  return result.responseData;
};

// Coolify checks a token's permissions before it looks up the resource, so a request for an application that can't
// exist changes nothing, and answers 404 when the token has the permission or 403 when it doesn't
const COOLIFY_MISSING_APPLICATION_PATH = "/applications/infisical-permission-check";

const assertCoolifyPermission = async (
  config: TCoolifyRequestConfig,
  coolifyRequestParams: TCoolifyRequest,
  deps: TCoolifyGatewayDeps
) => {
  try {
    await coolifyRequest(config, coolifyRequestParams, deps);
  } catch (error) {
    if (!isAxiosError(error) || error.response?.status !== 404) throw error;
  }
};

export const validateCoolifyConnectionCredentials = async (
  config: TCoolifyConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const deps = { gatewayV2Service };

  try {
    // Projects need only the read permission, and tokens limited to selected resources can still list them
    const projects = await coolifyRequest<unknown>(config, { method: "GET", path: "/projects" }, deps);

    if (!Array.isArray(projects)) {
      throw new BadRequestError({
        message: "Unable to validate Coolify connection: the instance URL did not respond like a Coolify instance"
      });
    }

    // Every sync writes and deletes variables, so a token that can't is refused here rather than on its first sync
    await assertCoolifyPermission(
      config,
      { method: "PATCH", path: `${COOLIFY_MISSING_APPLICATION_PATH}/envs/bulk`, data: { data: [] } },
      deps
    );
    await assertCoolifyPermission(
      config,
      { method: "DELETE", path: `${COOLIFY_MISSING_APPLICATION_PATH}/envs/infisical-permission-check` },
      deps
    );
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to validate Coolify connection credentials");
    throw new BadRequestError({
      message: `Unable to validate Coolify connection: ${
        isAxiosError(error) && error.response?.status === 404
          ? "the instance URL did not respond like a Coolify instance. Use the URL of the Coolify dashboard, without a path such as /api/v1"
          : getCoolifyErrorMessage(error, "verify the instance URL and API token")
      }`
    });
  }

  return config.credentials;
};

const toCoolifyResourceType = (type: string) => {
  if (type === "application") return CoolifyResourceType.Application;
  if (type === "service") return CoolifyResourceType.Service;
  // Databases are reported by engine, such as standalone-postgresql
  if (type.startsWith("standalone-")) return CoolifyResourceType.Database;

  return undefined;
};

export const listCoolifyResources = async (
  appConnection: TCoolifyConnection,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<TCoolifyResource[]> => {
  try {
    const connection = await resolveCoolifyGateway(appConnection, gatewayPoolService);
    const deps = { gatewayV2Service };

    // None of these endpoints are paginated; Coolify returns each list whole
    const [resources, projects] = await Promise.all([
      coolifyRequest<TCoolifyApiResource[]>(connection, { method: "GET", path: "/resources" }, deps),
      coolifyRequest<TCoolifyApiProject[]>(connection, { method: "GET", path: "/projects" }, deps)
    ]);

    // A resource only names its environment's ID, so names come from each project's environments to tell
    // apart resources that share a name across environments
    const results = await Promise.allSettled(
      projects.map((project) =>
        coolifyRequest<TCoolifyApiEnvironment[]>(
          connection,
          { method: "GET", path: `/projects/${encodeURIComponent(project.uuid)}/environments` },
          deps
        )
      )
    );

    // One project that can't be read should not hide the others; only fail when every project does
    const environments = new Map<number, { projectName: string; environmentName: string }>();
    results.forEach((result, index) => {
      const project = projects[index];

      if (result.status === "rejected") {
        logger.warn(
          toLoggableError(result.reason),
          `Failed to list environments of Coolify project [projectUuid=${project.uuid}] [appConnectionId=${appConnection.id}]`
        );
        return;
      }

      result.value.forEach((environment) =>
        environments.set(environment.id, { projectName: project.name, environmentName: environment.name })
      );
    });

    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length && failures.length === results.length) throw failures[0].reason;

    return resources
      .flatMap((resource) => {
        const type = toCoolifyResourceType(resource.type);
        const environment = environments.get(resource.environment_id);

        return type && environment ? [{ id: resource.uuid, name: resource.name, type, ...environment }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), `Failed to list Coolify resources [appConnectionId=${appConnection.id}]`);
    throw new BadRequestError({
      message: `Failed to list Coolify resources: ${getCoolifyErrorMessage(error, "verify the instance URL and API token")}`
    });
  }
};
