import { AxiosError, AxiosResponse } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { HumanitecConnectionMethod } from "./humanitec-connection-enums";
import {
  HumanitecApp,
  HumanitecOrg,
  HumanitecOrgWithApps,
  THumanitecConnection,
  THumanitecConnectionConfig
} from "./humanitec-connection-types";

export const getHumanitecConnectionListItem = () => {
  return {
    name: "Humanitec" as const,
    app: AppConnection.Humanitec as const,
    methods: Object.values(HumanitecConnectionMethod) as [HumanitecConnectionMethod.AccessKey]
  };
};

export const validateHumanitecConnectionCredentials = async (config: THumanitecConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  let response: AxiosResponse<HumanitecOrg[]> | null = null;

  try {
    response = await request.get<HumanitecOrg[]>(`${IntegrationUrls.HUMANITEC_API_URL}/orgs`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.accessKeyId}`
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.response?.data || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection - verify credentials"
    });
  }

  if (!response?.data) {
    throw new InternalServerError({
      message: "Failed to get organizations: Response was empty"
    });
  }

  return inputCredentials;
};

export const listOrganizations = async (appConnection: THumanitecConnection): Promise<HumanitecOrgWithApps[]> => {
  const {
    credentials: { accessKeyId }
  } = appConnection;
  const response = await request.get<HumanitecOrg[]>(`${IntegrationUrls.HUMANITEC_API_URL}/orgs`, {
    headers: {
      Authorization: `Bearer ${accessKeyId}`
    }
  });

  if (!response.data) {
    throw new InternalServerError({
      message: "Failed to get organizations: Response was empty"
    });
  }

  const orgs = response.data;
  const appPromises = orgs.map(async (org) => {
    return request.get<HumanitecApp[]>(`${IntegrationUrls.HUMANITEC_API_URL}/orgs/${org.id}/apps`, {
      headers: {
        Authorization: `Bearer ${accessKeyId}`
      }
    });
  });

  const appsResponses = await Promise.all(appPromises);

  const orgsWithApps: HumanitecOrgWithApps[] = orgs.map((org, index) => {
    if (!appsResponses[index].data) {
      throw new InternalServerError({
        message: "Failed to get apps for organization: Response was empty"
      });
    }

    const apps = appsResponses[index].data;
    return {
      ...org,
      apps: apps.map((app) => ({
        name: app.name,
        id: app.id,
        envs: app.envs
      }))
    };
  });
  return orgsWithApps;
};
