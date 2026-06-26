import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { QoveryConnectionMethod } from "./qovery-connection-enums";
import { TQoveryConnection, TQoveryConnectionConfig } from "./qovery-connection-types";

export const QOVERY_DEFAULT_API_URL = "https://api.qovery.com";

// Accepts anything carrying Qovery credentials (a create config or a stored connection) so the
// same resolver is reused by validation, resource discovery, and the secret sync.
export const getQoveryInstanceUrl = async (connection: { credentials: { instanceUrl?: string } }) => {
  const instanceUrl = connection.credentials.instanceUrl
    ? removeTrailingSlash(connection.credentials.instanceUrl)
    : QOVERY_DEFAULT_API_URL;

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getQoveryAuthHeaders = (accessToken: string) => ({
  Authorization: `Token ${accessToken}`,
  Accept: "application/json"
});

export type TQoveryResource = { id: string; name: string };

const listQoveryResources = async (appConnection: TQoveryConnection, path: string): Promise<TQoveryResource[]> => {
  const instanceUrl = await getQoveryInstanceUrl(appConnection);
  const { accessToken } = appConnection.credentials;

  const { data } = await request.get<{ results?: TQoveryResource[] }>(`${instanceUrl}${path}`, {
    headers: getQoveryAuthHeaders(accessToken)
  });

  return (data.results ?? []).map(({ id, name }) => ({ id, name }));
};

export const listQoveryOrganizations = async (appConnection: TQoveryConnection) =>
  listQoveryResources(appConnection, "/organization");

export const listQoveryProjects = async (appConnection: TQoveryConnection, organizationId: string) =>
  listQoveryResources(appConnection, `/organization/${organizationId}/project`);

export const listQoveryEnvironments = async (appConnection: TQoveryConnection, projectId: string) =>
  listQoveryResources(appConnection, `/project/${projectId}/environment`);

export const getQoveryConnectionListItem = () => {
  return {
    name: "Qovery" as const,
    app: AppConnection.Qovery as const,
    methods: Object.values(QoveryConnectionMethod) as [QoveryConnectionMethod.AccessToken]
  };
};

export const validateQoveryConnectionCredentials = async (config: TQoveryConnectionConfig) => {
  const instanceUrl = await getQoveryInstanceUrl(config);
  const { accessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/organization`, {
      headers: {
        Authorization: `Token ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Qovery credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Failed to validate Qovery credentials - verify the project access token is correct"
    });
  }

  return config.credentials;
};
