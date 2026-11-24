import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AzureDevOpsConnectionMethod } from "@app/services/app-connection/azure-devops/azure-devops-enums";
import { getAzureDevopsConnection } from "@app/services/app-connection/azure-devops/azure-devops-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAzureDevOpsSyncWithCredentials } from "./azure-devops-sync-types";

type TAzureDevOpsSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">;
};

interface AzureDevOpsVariableGroup {
  id: number;
  name: string;
  description: string;
  type: string;
  variables: Record<string, { value: string; isSecret: boolean }>;
  variableGroupProjectReferences: Array<{
    description: string;
    name: string;
    projectReference: { id: string; name: string };
  }>;
}

interface AzureDevOpsVariableGroupList {
  count: number;
  value: AzureDevOpsVariableGroup[];
}

export const azureDevOpsSyncFactory = ({
  kmsDataKeyService,
  appConnectionDAL,
  instanceConfigService,
  oidcIssuerService
}: TAzureDevOpsSyncFactoryDeps) => {
  const getConnectionAuth = async (secretSync: TAzureDevOpsSyncWithCredentials) => {
    const { credentials } = secretSync.connection;
    const isBearer = secretSync.connection.method !== AzureDevOpsConnectionMethod.AccessToken;

    const { orgName } = credentials;
    if (!orgName) {
      throw new BadRequestError({
        message: "Azure DevOps: organization name is required"
      });
    }

    const accessToken = await getAzureDevopsConnection(
      secretSync.connectionId,
      appConnectionDAL,
      kmsDataKeyService,
      instanceConfigService,
      oidcIssuerService
    );

    return { accessToken, orgName, isBearer };
  };

  const getAuthHeader = (accessToken: string, isBearer: boolean) => {
    if (isBearer) {
      return `Bearer ${accessToken}`;
    }
    const basicAuth = Buffer.from(`:${accessToken}`).toString("base64");
    return `Basic ${basicAuth}`;
  };

  const $getEnvGroupId = async (
    accessToken: string,
    orgName: string,
    projectId: string,
    environmentName: string,
    isBearer: boolean
  ) => {
    const url = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(orgName)}/${encodeURIComponent(projectId)}/_apis/distributedtask/variablegroups?api-version=7.1`;
    const response = await request.get<AzureDevOpsVariableGroupList>(url, {
      headers: {
        Authorization: getAuthHeader(accessToken, isBearer)
      }
    });

    for (const group of response.data.value) {
      if (group.name === environmentName) {
        return { groupId: group.id.toString(), groupName: group.name };
      }
    }
    return { groupId: "", groupName: "" };
  };

  const syncSecrets = async (secretSync: TAzureDevOpsSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    if (!secretSync.destinationConfig.devopsProjectId) {
      throw new BadRequestError({
        message: "Azure DevOps: project ID is required"
      });
    }

    if (!secretSync.environment?.name) {
      throw new BadRequestError({
        message: "Azure DevOps: environment name is required"
      });
    }

    const { accessToken, orgName, isBearer } = await getConnectionAuth(secretSync);

    const { groupId, groupName } = await $getEnvGroupId(
      accessToken,
      orgName,
      secretSync.destinationConfig.devopsProjectId,
      secretSync.environment.name,
      isBearer
    );

    const variables: Record<string, { value: string; isSecret: boolean }> = {};
    for (const [key, secret] of Object.entries(secretMap)) {
      if (secret?.value !== undefined) {
        variables[key] = { value: secret.value, isSecret: true };
      }
    }

    if (!groupId) {
      // Create new variable group - API endpoint is organization-level
      const url = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(orgName)}/_apis/distributedtask/variablegroups?api-version=7.1`;

      await request.post(
        url,
        {
          name: secretSync.environment.name,
          description: secretSync.environment.name,
          type: "Vsts",
          variables,
          variableGroupProjectReferences: [
            {
              description: secretSync.environment.name,
              name: secretSync.environment.name,
              projectReference: {
                id: secretSync.destinationConfig.devopsProjectId,
                name: secretSync.destinationConfig.devopsProjectId
              }
            }
          ]
        },
        {
          headers: {
            Authorization: getAuthHeader(accessToken, isBearer),
            "Content-Type": "application/json"
          }
        }
      );
    } else {
      const url = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(orgName)}/_apis/distributedtask/variablegroups/${groupId}?api-version=7.1`;

      await request.put(
        url,
        {
          name: groupName,
          description: groupName,
          type: "Vsts",
          variables,
          variableGroupProjectReferences: [
            {
              description: groupName,
              name: groupName,
              projectReference: {
                id: secretSync.destinationConfig.devopsProjectId,
                name: secretSync.destinationConfig.devopsProjectId
              }
            }
          ]
        },
        {
          headers: {
            Authorization: getAuthHeader(accessToken, isBearer),
            "Content-Type": "application/json"
          }
        }
      );
    }
  };

  const removeSecrets = async (secretSync: TAzureDevOpsSyncWithCredentials) => {
    const { accessToken, orgName, isBearer } = await getConnectionAuth(secretSync);

    const { groupId } = await $getEnvGroupId(
      accessToken,
      orgName,
      secretSync.destinationConfig.devopsProjectId,
      secretSync.environment?.name || "",
      isBearer
    );

    if (groupId) {
      // Delete the variable group entirely using the DELETE API
      const deleteUrl = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(orgName)}/_apis/distributedtask/variablegroups/${groupId}?projectIds=${secretSync.destinationConfig.devopsProjectId}&api-version=7.1`;

      await request.delete(deleteUrl, {
        headers: {
          Authorization: getAuthHeader(accessToken, isBearer)
        }
      });
    }
  };

  const getSecrets = async (secretSync: TAzureDevOpsSyncWithCredentials) => {
    const { accessToken, orgName, isBearer } = await getConnectionAuth(secretSync);

    const { groupId } = await $getEnvGroupId(
      accessToken,
      orgName,
      secretSync.destinationConfig.devopsProjectId,
      secretSync.environment?.name || "",
      isBearer
    );

    const secretMap: TSecretMap = {};

    if (groupId) {
      const url = `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${orgName}/_apis/distributedtask/variablegroups/${groupId}?api-version=7.1`;
      const response = await request.get<AzureDevOpsVariableGroup>(url, {
        headers: {
          Authorization: getAuthHeader(accessToken, isBearer)
        }
      });

      if (response?.data?.variables) {
        Object.entries(response.data.variables).forEach(([key, variable]) => {
          secretMap[key] = {
            value: variable.value || ""
          };
        });
      }
    }

    return secretMap;
  };

  return {
    syncSecrets,
    removeSecrets,
    getSecrets
  };
};
