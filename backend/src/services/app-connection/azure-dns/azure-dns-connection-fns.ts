import { AxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AzureDnsConnectionMethod } from "./azure-dns-connection-enum";
import { TAzureDnsConnection, TAzureDnsConnectionConfig, TAzureDnsZone } from "./azure-dns-connection-types";

const AZURE_DNS_ZONE_RESOURCE_ID_REGEX = new RE2(
  "^\\/subscriptions\\/[0-9a-f-]+\\/resourceGroups\\/[^/]+\\/providers\\/Microsoft\\.Network\\/dnsZones\\/[^/]+$",
  "i"
);

export const validateAzureDnsZoneResourceId = (hostedZoneId: string): void => {
  if (!AZURE_DNS_ZONE_RESOURCE_ID_REGEX.test(hostedZoneId)) {
    throw new BadRequestError({
      message: "Invalid Azure DNS Zone resource ID format."
    });
  }
};

interface AzureDnsZonesResponse {
  value: Array<{
    id: string;
    name: string;
    type: string;
    properties?: {
      nameServers?: string[];
    };
  }>;
  nextLink?: string;
}

export const getAzureDnsAccessToken = async (
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> => {
  const tokenResponse = await request.post<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://management.azure.com/.default"
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return tokenResponse.data.access_token;
};

export const getAzureDnsConnectionListItem = () => {
  return {
    name: "Azure DNS" as const,
    app: AppConnection.AzureDNS as const,
    methods: Object.values(AzureDnsConnectionMethod) as [AzureDnsConnectionMethod.ClientSecret]
  };
};

export const listAzureDnsZones = async (appConnection: TAzureDnsConnection): Promise<TAzureDnsZone[]> => {
  if (appConnection.method !== AzureDnsConnectionMethod.ClientSecret) {
    throw new BadRequestError({ message: "Unsupported Azure DNS connection method" });
  }

  const {
    credentials: { tenantId, clientId, clientSecret, subscriptionId }
  } = appConnection;

  try {
    const accessToken = await getAzureDnsAccessToken(tenantId, clientId, clientSecret);

    const allZones: TAzureDnsZone[] = [];
    const baseUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/dnszones?api-version=2018-05-01`;

    const fetchZones = async (url: string): Promise<AzureDnsZonesResponse> => {
      const resp = await request.get<AzureDnsZonesResponse>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
      return resp.data;
    };

    let response = await fetchZones(baseUrl);

    while (response) {
      if (response.value) {
        const zones = response.value.map((zone) => ({
          id: zone.id,
          name: zone.name
        }));
        allZones.push(...zones);
      }

      if (!response.nextLink) {
        break;
      }

      if (!response.nextLink.startsWith("https://management.azure.com/")) {
        throw new BadRequestError({ message: "Invalid nextLink URL from Azure API" });
      }

      // eslint-disable-next-line no-await-in-loop
      response = await fetchZones(response.nextLink);
    }

    return allZones;
  } catch (error: unknown) {
    logger.error(error, "Error listing Azure DNS zones");
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Azure DNS zones: ${
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          error.response?.data?.error?.message || error.message || "Unknown error"
        }`
      });
    }
    throw new BadRequestError({
      message: "Unable to list Azure DNS zones"
    });
  }
};

export const validateAzureDnsConnectionCredentials = async (config: TAzureDnsConnectionConfig) => {
  if (config.method !== AzureDnsConnectionMethod.ClientSecret) {
    throw new BadRequestError({ message: "Unsupported Azure DNS connection method" });
  }

  const { tenantId, clientId, clientSecret, subscriptionId } = config.credentials;

  try {
    const accessToken = await getAzureDnsAccessToken(tenantId, clientId, clientSecret);

    const resp = await request.get(
      `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/dnszones?api-version=2018-05-01`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    if (resp.status !== 200) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid credentials provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          error.response?.data?.error?.message || error.message || "Unknown error"
        }`
      });
    }
    if (error instanceof BadRequestError) {
      throw error;
    }
    logger.error(error, "Error validating Azure DNS connection credentials");
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
