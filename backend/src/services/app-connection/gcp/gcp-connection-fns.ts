import { ExternalAccountClient, gaxios, GoogleAuth, Impersonated, JWT } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { GcpConnectionMethod } from "./gcp-connection-enums";
import {
  GCPApp,
  GCPGetProjectLocationsRes,
  GCPGetProjectsRes,
  GCPGetServiceRes,
  GCPLocation,
  TGcpConnection,
  TGcpConnectionConfig
} from "./gcp-connection-types";

export const getGcpConnectionListItem = () => {
  return {
    name: "GCP" as const,
    app: AppConnection.GCP as const,
    methods: Object.values(GcpConnectionMethod) as [GcpConnectionMethod.ServiceAccountImpersonation]
  };
};

export const getGcpConnectionAuthToken = async (appConnection: TGcpConnectionConfig) => {
  const appCfg = getConfig();
  if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
    throw new InternalServerError({
      message: `Environment variables have not been configured for GCP ${getAppConnectionMethodName(
        GcpConnectionMethod.ServiceAccountImpersonation
      )}`
    });
  }

  const credJson = JSON.parse(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) as
    | {
        type: "service_account";
        client_email: string;
        private_key: string;
      }
    | {
        type: "external_account";
        audience: string;
        subject_token_type: string;
        token_url: string;
        service_account_impersonation_url: string;
        credential_source: {
          file: string;
        };
      }
    | {
        type: "gke_workload_identity";
      };

  let sourceClient: JWT | ExternalAccountClient | GoogleAuth;
  let useImpersonation = true;

  // Support three authentication methods:
  // 1. Workload Identity Federation (external_account) - for GitHub Actions, AWS, Azure, etc.
  // 2. GKE Workload Identity (gke_workload_identity) - for GKE pods using metadata server
  // 3. Traditional service account key (service_account) - legacy method
  if (credJson.type === "external_account") {
    // Workload Identity Federation - use ExternalAccountClient.fromJSON()
    // This is for external identity providers (GitHub, AWS, Azure) that use
    // a Workload Identity Pool and Provider
    sourceClient = ExternalAccountClient.fromJSON(credJson) as ExternalAccountClient;
  } else if (credJson.type === "gke_workload_identity") {
    // GKE Workload Identity - use GoogleAuth to access metadata server
    // This is for GKE pods that have Workload Identity enabled via
    // iam.gke.io/gcp-service-account annotation
    // The pod is already running as the target service account, so no impersonation needed
    sourceClient = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
    useImpersonation = false;
  } else {
    // Traditional service account key - use JWT
    sourceClient = new JWT({
      email: credJson.client_email,
      key: credJson.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
  }

  let tokenResponse: GetAccessTokenResponse | undefined;

  if (useImpersonation) {
    // Use impersonation for service account keys and Workload Identity Federation
    const impersonatedCredentials = new Impersonated({
      sourceClient,
      targetPrincipal: appConnection.credentials.serviceAccountEmail,
      lifetime: 3600,
      delegates: [],
      targetScopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });

    try {
      tokenResponse = await impersonatedCredentials.getAccessToken();
    } catch (error) {
      let message = "Unable to validate connection";
      if (error instanceof gaxios.GaxiosError) {
        message = error.message;
      }

      throw new BadRequestError({
        message
      });
    }
  } else {
    // For GKE Workload Identity, get token directly (no impersonation needed)
    try {
      const client = await sourceClient.getClient();
      tokenResponse = await client.getAccessToken();
    } catch (error) {
      let message = "Unable to validate connection";
      if (error instanceof gaxios.GaxiosError) {
        message = error.message;
      }

      throw new BadRequestError({
        message
      });
    }
  }

  if (!tokenResponse || !tokenResponse.token) {
    throw new BadRequestError({
      message: `Unable to validate connection`
    });
  }

  return tokenResponse.token;
};

export const getGcpSecretManagerProjects = async (appConnection: TGcpConnection) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection);

  let gcpApps: GCPApp[] = [];

  const pageSize = 100;
  let pageToken: string | undefined;
  let hasMorePages = true;

  const projects: {
    name: string;
    id: string;
  }[] = [];

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<GCPGetProjectsRes>(`${IntegrationUrls.GCP_API_URL}/v1/projects`, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    });

    gcpApps = gcpApps.concat(data.projects);

    if (!data.nextPageToken) {
      hasMorePages = false;
    }

    pageToken = data.nextPageToken;
  }

  // eslint-disable-next-line
  for await (const gcpApp of gcpApps) {
    try {
      const res = (
        await request.get<GCPGetServiceRes>(
          `${IntegrationUrls.GCP_SERVICE_USAGE_URL}/v1/projects/${gcpApp.projectId}/services/${IntegrationUrls.GCP_SECRET_MANAGER_SERVICE_NAME}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        )
      ).data;

      if (res.state === "ENABLED") {
        projects.push({
          name: gcpApp.name,
          id: gcpApp.projectId
        });
      }
    } catch {
      // eslint-disable-next-line
      continue;
    }
  }

  return projects;
};

export const getGcpSecretManagerProjectLocations = async (projectId: string, appConnection: TGcpConnection) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection);

  let gcpLocations: GCPLocation[] = [];

  const pageSize = 100;
  let pageToken: string | undefined;
  let hasMorePages = true;

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<GCPGetProjectLocationsRes>(
      `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${projectId}/locations`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    gcpLocations = gcpLocations.concat(data.locations);

    if (!data.nextPageToken) {
      hasMorePages = false;
    }

    pageToken = data.nextPageToken;
  }

  return gcpLocations.sort((a, b) => a.displayName.localeCompare(b.displayName));
};

export const validateGcpConnectionCredentials = async (appConnection: TGcpConnectionConfig) => {
  // Check if provided service account email suffix matches organization ID.
  // We do this to mitigate confused deputy attacks in multi-tenant instances
  if (appConnection.credentials.serviceAccountEmail) {
    const expectedAccountIdSuffix = appConnection.orgId.split("-").slice(0, 2).join("-");
    const serviceAccountId = appConnection.credentials.serviceAccountEmail.split("@")[0];
    if (!serviceAccountId.endsWith(expectedAccountIdSuffix)) {
      throw new BadRequestError({
        message: `GCP service account ID must have a suffix of "${expectedAccountIdSuffix}" e.g. service-account-${expectedAccountIdSuffix}@my-project.iam.gserviceaccount.com"`
      });
    }
  }

  await getGcpConnectionAuthToken(appConnection);

  return appConnection.credentials;
};
