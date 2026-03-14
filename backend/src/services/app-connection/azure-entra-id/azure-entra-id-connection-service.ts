import RE2 from "re2";

import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAzureEntraIdConnectionAccessToken, graphApiRequest } from "./azure-entra-id-connection-fns";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAppConnection>;

type TAzureSyncJob = {
  templateId: string;
  schedule?: {
    state?: string;
  };
};

type TAzureSyncJobsResponse = {
  value: TAzureSyncJob[];
};

type TAzureServicePrincipal = {
  id: string;
  displayName: string;
  appId: string;
};

type TAzureServicePrincipalsResponse = {
  value: TAzureServicePrincipal[];
  "@odata.nextLink"?: string;
};

const SCIM_SERVICE_PRINCIPALS_LIMIT = 5;

export const azureEntraIdConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listScimServicePrincipals = async (connectionId: string, actor: OrgServiceActor, search?: string) => {
    const appConnection = await getAppConnection(AppConnection.AzureEntraId, connectionId, actor);
    const accessToken = await getAzureEntraIdConnectionAccessToken(appConnection.id, appConnectionDAL, kmsService);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    };

    // Build the Graph API URL with optional search filter and limited page size
    let url = `https://graph.microsoft.com/v1.0/servicePrincipals?$top=${SCIM_SERVICE_PRINCIPALS_LIMIT}&$select=id,displayName,appId`;

    if (search) {
      const re2Pattern = new RE2(/[^a-zA-Z0-9 -]/g);
      const sanitizedSearch = re2Pattern.replace(search, "");
      if (sanitizedSearch) {
        url += `&$filter=startswith(displayName,'${sanitizedSearch}')`;
      }
    }

    const data = await graphApiRequest<TAzureServicePrincipalsResponse>(
      url,
      headers,
      "list service principals from Microsoft Graph"
    );

    // Filter to only those with SCIM synchronization jobs
    const scimServicePrincipals: { id: string; displayName: string; appId: string }[] = [];

    const checkScimServicePrincipal = async (sp: TAzureServicePrincipal) => {
      try {
        const jobsData = await graphApiRequest<TAzureSyncJobsResponse>(
          `https://graph.microsoft.com/v1.0/servicePrincipals/${sp.id}/synchronization/jobs`,
          headers,
          `fetch synchronization jobs for service principal '${sp.displayName}'`
        );

        if (jobsData.value.length > 0) {
          scimServicePrincipals.push({
            id: sp.id,
            displayName: sp.displayName,
            appId: sp.appId
          });
        }
      } catch {
        // SP doesn't have synchronization configured, skip
      }
    };

    await Promise.all(data.value.map(checkScimServicePrincipal));

    return scimServicePrincipals;
  };

  return {
    listScimServicePrincipals
  };
};
