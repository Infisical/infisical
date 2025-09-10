/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-case-declarations */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AzureDevOpsConnectionMethod } from "./azure-devops-enums";
import { getAzureDevopsConnection } from "./azure-devops-fns";
import { TAzureDevOpsConnection } from "./azure-devops-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAzureDevOpsConnection>;

type TAzureDevOpsProject = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  state?: string;
  visibility?: string;
  lastUpdateTime?: string;
  revision?: number;
  abbreviation?: string;
  defaultTeamImageUrl?: string;
};

type TAzureDevOpsProjectsResponse = {
  count: number;
  value: TAzureDevOpsProject[];
};

const getAuthHeaders = (appConnection: TAzureDevOpsConnection, accessToken: string) => {
  switch (appConnection.method) {
    case AzureDevOpsConnectionMethod.OAuth:
      return {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      };
    case AzureDevOpsConnectionMethod.AccessToken:
      // For access token, create Basic auth header
      const basicAuthToken = Buffer.from(`user:${accessToken}`).toString("base64");
      return {
        Authorization: `Basic ${basicAuthToken}`,
        Accept: "application/json"
      };
    case AzureDevOpsConnectionMethod.ClientSecret:
      return {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      };
    default:
      throw new BadRequestError({ message: "Unsupported connection method" });
  }
};

const listAzureDevOpsProjects = async (
  appConnection: TAzureDevOpsConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<TAzureDevOpsProject[]> => {
  const accessToken = await getAzureDevopsConnection(appConnection.id, appConnectionDAL, kmsService);

  // Both OAuth and access Token methods use organization name from credentials
  const credentials = appConnection.credentials as { orgName: string };
  const { orgName } = credentials;

  // Use the standard Azure DevOps Projects API endpoint
  // This endpoint returns only projects that the authenticated user has access to
  const devOpsEndpoint = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(orgName)}/_apis/projects?api-version=7.1`;
  try {
    const { data } = await request.get<TAzureDevOpsProjectsResponse>(devOpsEndpoint, {
      headers: getAuthHeaders(appConnection, accessToken)
    });

    return data.value || [];
  } catch (error) {
    if (error instanceof AxiosError) {
      // Provide more specific error messages based on the response
      if (error?.response?.status === 401) {
        throw new Error(
          `Authentication failed for Azure DevOps organization: ${orgName}. Please check your credentials and ensure the token has the required scopes (vso.project or vso.profile).`
        );
      } else if (error?.response?.status === 403) {
        throw new Error(
          `Access denied to Azure DevOps organization: ${orgName}. Please ensure the user has access to the organization.`
        );
      } else if (error?.response?.status === 404) {
        throw new Error(`Azure DevOps organization not found: ${orgName}. Please verify the organization name.`);
      }
    }
    throw error;
  }
};

export const azureDevOpsConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AzureDevOps, connectionId, actor);

    const projects = await listAzureDevOpsProjects(appConnection, appConnectionDAL, kmsService);

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      appId: project.id,
      description: project.description,
      url: project.url,
      state: project.state,
      visibility: project.visibility,
      lastUpdateTime: project.lastUpdateTime,
      revision: project.revision,
      abbreviation: project.abbreviation,
      defaultTeamImageUrl: project.defaultTeamImageUrl
    }));
  };

  return {
    listProjects
  };
};
