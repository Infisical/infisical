import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
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
    methods: Object.values(ExternalInfisicalConnectionMethod) as [ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth]
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

export const validateExternalInfisicalConnectionCredentials = async (
  config: TExternalInfisicalConnectionConfig,
  identityUaDAL: Pick<TIdentityUaDALFactory, "findOne">
) => {
  const { credentials: inputCredentials } = config;

  await blockLocalAndPrivateIpAddresses(inputCredentials.instanceUrl);

  const localIdentity = await identityUaDAL.findOne({
    clientId: inputCredentials.machineIdentityClientId
  });

  if (localIdentity) {
    throw new BadRequestError({
      message:
        "Cannot create an Infisical connection targeting the same instance. Use a machine identity from a different Infisical instance."
    });
  }

  try {
    await getExternalInfisicalAccessToken(inputCredentials);
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

  return inputCredentials;
};

const getAuthHeaders = async (connection: TExternalInfisicalConnection) => {
  await blockLocalAndPrivateIpAddresses(connection.credentials.instanceUrl);
  const token = await getExternalInfisicalAccessToken(connection.credentials);
  return { Authorization: `Bearer ${token}` };
};

const getBaseUrl = (connection: TExternalInfisicalConnection) => connection.credentials.instanceUrl.replace(/\/$/, "");

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
    }>(`${baseUrl}/api/v1/projects`, { headers });
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
