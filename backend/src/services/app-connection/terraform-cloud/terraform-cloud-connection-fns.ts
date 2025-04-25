import { AxiosError, AxiosResponse } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TerraformCloudConnectionMethod } from "./terraform-cloud-connection-enums";
import {
  TTerraformCloudConnection,
  TTerraformCloudConnectionConfig,
  TTerraformCloudOrganization,
  TTerraformCloudVariableSet,
  TTerraformCloudWorkspace
} from "./terraform-cloud-connection-types";

export const getTerraformCloudConnectionListItem = () => {
  return {
    name: "Terraform Cloud" as const,
    app: AppConnection.TerraformCloud as const,
    methods: Object.values(TerraformCloudConnectionMethod) as [TerraformCloudConnectionMethod.ApiToken]
  };
};

export const validateTerraformCloudConnectionCredentials = async (config: TTerraformCloudConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  let response: AxiosResponse<{ data: TTerraformCloudOrganization[] }> | null = null;

  try {
    response = await request.get<{ data: TTerraformCloudOrganization[] }>(
      `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/organizations`,
      {
        headers: {
          Authorization: `Bearer ${inputCredentials.apiToken}`,
          "Content-Type": "application/vnd.api+json"
        }
      }
    );
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

  if (!response?.data) {
    throw new InternalServerError({
      message: "Failed to get organizations: Response was empty"
    });
  }

  return inputCredentials;
};

export const listOrganizations = async (
  appConnection: TTerraformCloudConnection
): Promise<TTerraformCloudOrganization[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/vnd.api+json"
  };

  const fetchAllPages = async <T>(url: string): Promise<T[]> => {
    let results: T[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      // eslint-disable-next-line no-await-in-loop
      const res: AxiosResponse<{ data: T[]; links?: { next?: string } }> = await request.get(nextUrl, { headers });
      results = results.concat(res.data.data);
      nextUrl = res.data.links?.next || null;
    }

    return results;
  };

  const orgEntities = await fetchAllPages<{ id: string; attributes: { name: string } }>(
    `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/organizations`
  );

  const orgsWithVariableSetsAndWorkspaces: TTerraformCloudOrganization[] = [];

  const variableSetPromises = orgEntities.map((org) =>
    fetchAllPages<{ id: string; attributes: { name: string; description?: string; global?: boolean } }>(
      `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/organizations/${org.id}/varsets`
    ).catch(() => [])
  );

  const workspacePromises = orgEntities.map((org) =>
    fetchAllPages<{ id: string; attributes: { name: string } }>(
      `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/organizations/${org.id}/workspaces`
    ).catch(() => [])
  );

  const [variableSetResults, workspaceResults] = await Promise.all([
    Promise.all(variableSetPromises),
    Promise.all(workspacePromises)
  ]);

  for (let i = 0; i < orgEntities.length; i += 1) {
    const org = orgEntities[i];
    const variableSetsData = variableSetResults[i];
    const workspacesData = workspaceResults[i];

    const variableSets: TTerraformCloudVariableSet[] = variableSetsData.map((varSet) => ({
      id: varSet.id,
      name: varSet.attributes.name,
      description: varSet.attributes.description,
      global: varSet.attributes.global
    }));

    const workspaces: TTerraformCloudWorkspace[] = workspacesData.map((workspace) => ({
      id: workspace.id,
      name: workspace.attributes.name
    }));

    orgsWithVariableSetsAndWorkspaces.push({
      id: org.id,
      name: org.attributes.name,
      variableSets,
      workspaces
    });
  }

  return orgsWithVariableSetsAndWorkspaces;
};
