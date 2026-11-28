import { AxiosError } from "axios";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";

import { getAzureManagedIdentityAccessToken } from "../shared/azure/azure-managed-identity-fns";
import { AzureDnsConnectionMethod } from "./azure-dns-connection-enums";
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

export const getAzureDnsConnectionAccessToken = async (
  appConnection: TAzureDnsConnection,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  switch (appConnection.method) {
    case AzureDnsConnectionMethod.ClientSecret: {
      const { tenantId, clientId, clientSecret } = appConnection.credentials;
      return getAzureDnsAccessToken(tenantId, clientId, clientSecret);
    }
    case AzureDnsConnectionMethod.ManagedIdentity: {
      const { tenantId, clientId } = appConnection.credentials;
      const { accessToken } = await getAzureManagedIdentityAccessToken(
        { appConnection, tenantId, clientId, scope: "https://management.azure.com/.default" },
        oidcIssuerService
      );
      return accessToken;
    }
    default:
      throw new BadRequestError({ message: "Unsupported Azure DNS connection method" });
  }
};

export const getAzureDnsConnectionListItem = () => {
  return {
    name: "Azure DNS" as const,
    app: AppConnection.AzureDNS as const,
    methods: Object.values(AzureDnsConnectionMethod) as [
      AzureDnsConnectionMethod.ClientSecret,
      AzureDnsConnectionMethod.ManagedIdentity
    ]
  };
};

export const listAzureDnsZones = async (
  appConnection: TAzureDnsConnection,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
): Promise<TAzureDnsZone[]> => {
  const { subscriptionId } = appConnection.credentials;

  try {
    const accessToken = await getAzureDnsConnectionAccessToken(appConnection, oidcIssuerService);

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

const verifyAzureDnsSubscriptionAccess = async (subscriptionId: string, getAccessToken: () => Promise<string>) => {
  try {
    const accessToken = await getAccessToken();

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
      const data = error.response?.data as { error?: { message?: string }; error_description?: string } | undefined;
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          data?.error?.message || data?.error_description || error.message || "Unknown error"
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
};

export const validateAzureDnsConnectionCredentials = async (
  config: TAzureDnsConnectionConfig,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  const { orgId, projectId, connection } = config;

  switch (config.method) {
    case AzureDnsConnectionMethod.ClientSecret: {
      const { tenantId, clientId, clientSecret, subscriptionId } = config.credentials;

      await verifyAzureDnsSubscriptionAccess(subscriptionId, () =>
        getAzureDnsAccessToken(tenantId, clientId, clientSecret)
      );

      return config.credentials;
    }
    case AzureDnsConnectionMethod.ManagedIdentity: {
      const { tenantId, clientId, subscriptionId } = config.credentials;

      // A new connection has no ID yet, so Azure cannot trust its subject. Verifying it after create runs the
      // exchange once the customer has added the federated credential.
      if (!connection) return config.credentials;

      await verifyAzureDnsSubscriptionAccess(subscriptionId, async () => {
        const { accessToken } = await getAzureManagedIdentityAccessToken(
          {
            appConnection: { ...connection, orgId, projectId },
            tenantId,
            clientId,
            scope: "https://management.azure.com/.default"
          },
          oidcIssuerService
        );
        return accessToken;
      });

      return config.credentials;
    }
    default:
      throw new BadRequestError({ message: "Unsupported Azure DNS connection method" });
  }
};
