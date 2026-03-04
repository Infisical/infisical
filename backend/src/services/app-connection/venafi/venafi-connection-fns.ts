import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { VenafiConnectionMethod, VenafiRegion } from "./venafi-connection-enum";
import { TVenafiConnection, TVenafiConnectionConfig } from "./venafi-connection-types";

type TVenafiCredentials = {
  apiKey: string;
  region: VenafiRegion;
};

type TVenafiApplication = {
  id: string;
  name: string;
};

type TVenafiIssuingTemplate = {
  id: string;
  name: string;
};

type TVenafiApplicationDetail = {
  id: string;
  name: string;
  certificateIssuingTemplateAliasIdMap: Record<string, string>;
};

type TVenafiApplicationsResponse = {
  applications: TVenafiApplicationDetail[];
};

type TVenafiIssuingTemplateDetail = {
  id: string;
  name: string;
  certificateAuthority: string;
};

type TVenafiIssuingTemplatesResponse = {
  certificateIssuingTemplates: TVenafiIssuingTemplateDetail[];
};

const VENAFI_REGION_BASE_URLS: Record<VenafiRegion, string> = {
  [VenafiRegion.US]: "https://api.venafi.cloud",
  [VenafiRegion.EU]: "https://api.eu.venafi.cloud",
  [VenafiRegion.AU]: "https://api.au.venafi.cloud",
  [VenafiRegion.UK]: "https://api.uk.venafi.cloud",
  [VenafiRegion.SG]: "https://api.sg.venafi.cloud",
  [VenafiRegion.CA]: "https://api.ca.venafi.cloud"
};

export const getVenafiBaseUrl = (region: VenafiRegion): string => {
  return VENAFI_REGION_BASE_URLS[region];
};

export const getVenafiHeaders = (apiKey: string) => ({
  "tppl-api-key": apiKey,
  Accept: "application/json"
});

export const getVenafiConnectionListItem = () => {
  return {
    name: "Venafi TLS Protect Cloud" as const,
    app: AppConnection.Venafi as const,
    methods: Object.values(VenafiConnectionMethod) as [VenafiConnectionMethod.ApiKey]
  };
};

export const validateVenafiConnectionCredentials = async (config: TVenafiConnectionConfig) => {
  const { apiKey, region } = config.credentials as TVenafiCredentials;

  const baseUrl = getVenafiBaseUrl(region);

  try {
    const resp = await request.get(`${baseUrl}/v1/useraccounts`, {
      headers: getVenafiHeaders(apiKey)
    });

    if (resp.data === null) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API key provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to validate credentials: ${error.response?.data?.error || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error)?.message || "Unknown error"}`
    });
  }

  return config.credentials;
};

export const listVenafiApplications = async (appConnection: TVenafiConnection): Promise<TVenafiApplication[]> => {
  const { apiKey, region } = appConnection.credentials as TVenafiCredentials;
  const baseUrl = getVenafiBaseUrl(region);

  try {
    const { data } = await request.get<TVenafiApplicationsResponse>(`${baseUrl}/outagedetection/v1/applications`, {
      headers: getVenafiHeaders(apiKey)
    });

    return (data.applications || []).map((app) => ({
      id: app.id,
      name: app.name
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to list Venafi applications: ${error.response?.data?.error || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: `Failed to list Venafi applications: ${(error as Error)?.message || "Unknown error"}`
    });
  }
};

export const listVenafiIssuingTemplates = async (
  appConnection: TVenafiConnection,
  applicationId: string
): Promise<TVenafiIssuingTemplate[]> => {
  const { apiKey, region } = appConnection.credentials as TVenafiCredentials;
  const baseUrl = getVenafiBaseUrl(region);

  try {
    // Fetch the application detail to get its linked template IDs
    const { data: appData } = await request.get<TVenafiApplicationDetail>(
      `${baseUrl}/outagedetection/v1/applications/${encodeURIComponent(applicationId)}`,
      {
        headers: getVenafiHeaders(apiKey)
      }
    );

    const templateAliasMap = appData.certificateIssuingTemplateAliasIdMap;
    if (!templateAliasMap || Object.keys(templateAliasMap).length === 0) {
      return [];
    }

    const templateIds = new Set(Object.values(templateAliasMap));

    // Fetch all issuing templates and filter to those linked to this application
    const { data: templatesData } = await request.get<TVenafiIssuingTemplatesResponse>(
      `${baseUrl}/v1/certificateissuingtemplates`,
      {
        headers: getVenafiHeaders(apiKey)
      }
    );

    return (templatesData.certificateIssuingTemplates || [])
      .filter((template) => templateIds.has(template.id))
      .map((template) => ({
        id: template.id,
        name: template.name
      }));
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to list Venafi issuing templates: ${error.response?.data?.error || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: `Failed to list Venafi issuing templates: ${(error as Error)?.message || "Unknown error"}`
    });
  }
};
