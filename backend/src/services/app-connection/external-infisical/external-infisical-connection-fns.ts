import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TIdentityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";

import { AppConnection } from "../app-connection-enums";
import { ExternalInfisicalConnectionMethod } from "./external-infisical-connection-enums";
import {
  TExternalInfisicalConnection,
  TExternalInfisicalConnectionConfig
} from "./external-infisical-connection-types";

export type TRemoteProject = {
  id: string;
  name: string;
  slug: string;
  environments: Array<{ id: string; name: string; slug: string }>;
};

export type TRemoteEnvironmentFolderTree = Record<
  string,
  { id: string; name: string; slug: string; folders: Array<{ id: string; name: string; path: string }> }
>;

export const getExternalInfisicalConnectionListItem = () => {
  return {
    name: "Infisical" as const,
    app: AppConnection.ExternalInfisical as const,
    methods: Object.values(ExternalInfisicalConnectionMethod) as [
      ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth
    ]
  };
};

export const getExternalInfisicalAccessToken = async (credentials: {
  instanceUrl: string;
  machineIdentityClientId: string;
  machineIdentityClientSecret: string;
}): Promise<string> => {
  const { instanceUrl, machineIdentityClientId, machineIdentityClientSecret } = credentials;

  const { data } = await request.post<{ accessToken: string; expiresIn: number; tokenType: string }>(
    `${instanceUrl}/api/v1/auth/universal-auth/login`,
    {
      clientId: machineIdentityClientId,
      clientSecret: machineIdentityClientSecret
    }
  );

  return data.accessToken;
};

const validateAccessTokenCredentials = async (credentials: {
  instanceUrl: string;
  machineIdentityClientId: string;
  machineIdentityClientSecret: string;
}): Promise<void> => {
  try {
    await getExternalInfisicalAccessToken(credentials);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateExternalInfisicalConnectionCredentials = async (
  config: TExternalInfisicalConnectionConfig,
  identityUaDAL: Pick<TIdentityUaDALFactory, "findOne">
) => {
  const { credentials: inputCredentials } = config;

  const appCfg = getConfig();
  const isSelfSync =
    appCfg.SITE_URL !== undefined &&
    removeTrailingSlash(appCfg.SITE_URL) === removeTrailingSlash(inputCredentials.instanceUrl);

  if (isSelfSync) {
    // For self-sync, validate the machine identity exists in this instance via DAL.
    // Skip the outbound HTTP token call — SITE_URL is the external URL and is not
    // reachable from within the container (ECONNREFUSED). Credentials are fully
    // validated at sync execution time via getAuthHeaders.
    const localIdentity = await identityUaDAL.findOne({
      clientId: inputCredentials.machineIdentityClientId
    });
    if (!localIdentity) {
      throw new BadRequestError({
        message: "Machine identity not found in this instance."
      });
    }
    await validateAccessTokenCredentials({
      ...inputCredentials,
      instanceUrl: removeTrailingSlash(`http://127.0.0.1:${appCfg.PORT}`)
    });
    return inputCredentials;
  }

  await blockLocalAndPrivateIpAddresses(inputCredentials.instanceUrl);

  const localIdentity = await identityUaDAL.findOne({
    clientId: inputCredentials.machineIdentityClientId
  });

  if (localIdentity) {
    throw new BadRequestError({
      message:
        "This machine identity belongs to this instance, but the Instance URL points to a different one. Use a machine identity from the target instance, or set the Instance URL to this deployment for same-instance sync."
    });
  }

  await validateAccessTokenCredentials(inputCredentials);

  return inputCredentials;
};

const getInternalBaseUrl = (instanceUrl: string): string | null => {
  const appCfg = getConfig();
  if (appCfg.SITE_URL !== undefined && removeTrailingSlash(appCfg.SITE_URL) === removeTrailingSlash(instanceUrl)) {
    return `http://127.0.0.1:${appCfg.PORT}`;
  }
  return null;
};

const getAuthHeaders = async (connection: TExternalInfisicalConnection) => {
  const internalBaseUrl = getInternalBaseUrl(connection.credentials.instanceUrl);
  if (!internalBaseUrl) {
    await blockLocalAndPrivateIpAddresses(connection.credentials.instanceUrl);
  }
  const effectiveCredentials = internalBaseUrl
    ? { ...connection.credentials, instanceUrl: internalBaseUrl }
    : connection.credentials;
  const token = await getExternalInfisicalAccessToken(effectiveCredentials);
  return { Authorization: `Bearer ${token}` };
};

const getBaseUrl = (connection: TExternalInfisicalConnection) =>
  getInternalBaseUrl(connection.credentials.instanceUrl) ?? removeTrailingSlash(connection.credentials.instanceUrl);

export const listProjects = async (connection: TExternalInfisicalConnection): Promise<TRemoteProject[]> => {
  const baseUrl = getBaseUrl(connection);
  const headers = await getAuthHeaders(connection);
  try {
    const { data } = await request.get<{
      projects: Array<{
        id: string;
        name: string;
        slug: string;
        environments?: Array<{ id: string; name: string; slug: string }>;
      }>;
    }>(`${baseUrl}/api/v1/projects`, { headers, params: { type: "secret-manager" } });
    return (data.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      environments: p.environments ?? []
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list projects from remote Infisical: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list projects from remote Infisical",
      error: error as Error
    });
  }
};

export const getEnvironmentFolderTree = async (
  connection: TExternalInfisicalConnection,
  projectId: string
): Promise<TRemoteEnvironmentFolderTree> => {
  const baseUrl = getBaseUrl(connection);
  const headers = await getAuthHeaders(connection);
  try {
    const { data } = await request.get<TRemoteEnvironmentFolderTree>(
      `${baseUrl}/api/v1/projects/${projectId}/environment-folder-tree`,
      { headers }
    );
    return data ?? {};
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to get folder tree from remote Infisical: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to get folder tree from remote Infisical",
      error: error as Error
    });
  }
};
