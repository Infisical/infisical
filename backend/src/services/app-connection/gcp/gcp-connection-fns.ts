import { STSClient } from "@aws-sdk/client-sts";
import { AxiosError } from "axios";
import { AwsClient, ExternalAccountClient, gaxios, Impersonated, JWT } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { GCP_GLOBAL_LOCATION } from "./gcp-connection-constants";
import { GcpConnectionMethod } from "./gcp-connection-enums";
import {
  GCPApp,
  GCPGetCertificateMapsRes,
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

type TGcpCredentialJson = {
  type?: string;
  client_email?: string;
  private_key?: string;
  subject_token_type?: string;
  credential_source?: { environment_id?: string };
};

const AWS_ENV_ID_REGEX = new RE2(/^aws\d+$/i);

// Lazily initialized so the SDK doesn't probe for AWS metadata on non-AWS instances at startup.
// Shared across calls so the SDK's internal credential cache persists.
let sharedStsClient: STSClient | undefined;
const getStsClient = () => {
  if (!sharedStsClient) {
    sharedStsClient = new STSClient({});
  }
  return sharedStsClient;
};

// AWS federation configs default `credential_source` to the EC2 metadata endpoint, which
// is absent on Fargate/Lambda/EKS. Detect them so we can source creds via the AWS SDK chain instead.
const isAwsExternalAccount = (credJson: TGcpCredentialJson) =>
  credJson.subject_token_type === "urn:ietf:params:aws:token-type:aws4_request" ||
  AWS_ENV_ID_REGEX.test(credJson.credential_source?.environment_id ?? "");

const buildGcpAwsExternalAccountClient = (credJson: TGcpCredentialJson, scopes: string[]) => {
  const stsClient = getStsClient();

  const awsSecurityCredentialsSupplier = {
    getAwsRegion: async () => {
      try {
        return await stsClient.config.region();
      } catch {
        return "us-east-1";
      }
    },
    getAwsSecurityCredentials: async () => {
      let credentials;
      try {
        credentials = await stsClient.config.credentials();
      } catch (error) {
        logger.error({ err: error }, "Failed to resolve AWS credentials for GCP workload identity federation");
        throw new InternalServerError({
          message:
            "Failed to resolve AWS credentials for GCP workload identity federation. Verify the instance has valid AWS credentials available (task role, instance profile, or environment variables)."
        });
      }
      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        token: credentials.sessionToken
      };
    }
  };

  // credential_source and aws_security_credentials_supplier are mutually exclusive; drop the metadata source.
  const awsClientOptions = { ...credJson, scopes, aws_security_credentials_supplier: awsSecurityCredentialsSupplier };
  delete awsClientOptions.credential_source;

  return new AwsClient(awsClientOptions as unknown as ConstructorParameters<typeof AwsClient>[0]);
};

export const buildGcpSourceCredential = (credentialJson: string) => {
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];

  const credJson = JSON.parse(credentialJson) as TGcpCredentialJson;

  if (credJson.type === "external_account") {
    if (isAwsExternalAccount(credJson)) {
      return buildGcpAwsExternalAccountClient(credJson, scopes);
    }

    const externalClient = ExternalAccountClient.fromJSON({
      ...credJson,
      scopes
    } as Parameters<typeof ExternalAccountClient.fromJSON>[0]);

    if (!externalClient) {
      throw new InternalServerError({
        message:
          "Failed to initialize GCP external account credentials. Verify the workload identity federation configuration."
      });
    }

    return externalClient;
  }

  return new JWT({
    email: credJson.client_email,
    key: credJson.private_key,
    scopes
  });
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

  const sourceClient = buildGcpSourceCredential(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL);

  const impersonatedCredentials = new Impersonated({
    sourceClient,
    targetPrincipal: appConnection.credentials.serviceAccountEmail,
    lifetime: 3600,
    delegates: [],
    targetScopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });

  let tokenResponse: GetAccessTokenResponse | undefined;
  try {
    tokenResponse = await impersonatedCredentials.getAccessToken();
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to obtain GCP impersonated access token [serviceAccountEmail=${appConnection.credentials.serviceAccountEmail}]`
    );

    throw new BadRequestError({
      message: error instanceof gaxios.GaxiosError ? error.message : "Unable to validate connection"
    });
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

type TGoogleApiError = {
  error?: { status?: string; message?: string };
};

const toGcpDiscoveryError = (error: unknown, context: { api: string; gcpProjectId?: string }) => {
  if (!(error instanceof AxiosError)) return error;

  const body = error.response?.data as TGoogleApiError | undefined;
  const message = body?.error?.message ?? error.message;
  const scope = context.gcpProjectId ? `GCP project "${context.gcpProjectId}"` : "your GCP project";

  if (error.response?.status === 403) {
    if (message.includes("has not been used in project") || message.includes("is disabled")) {
      return new BadRequestError({
        message: `The ${context.api} API is not enabled on ${scope}. Enable it in the Google Cloud console and try again.`
      });
    }

    return new BadRequestError({
      message: `The connection's service account does not have access to ${scope} via the ${context.api} API. Grant it the required roles on that project and try again.`
    });
  }

  if (error.response?.status === 404) {
    return new BadRequestError({ message: `${scope} was not found. Verify the project ID.` });
  }

  return new BadRequestError({ message: `${context.api} request failed: ${message}` });
};

const GCP_MAX_PAGES = 10;
const GCP_PAGE_SIZE = 100;
const GCP_SERVICE_CHECK_CONCURRENCY = 10;

const fetchGcpPages = async <TResponse extends { nextPageToken?: string }, TItem>({
  url,
  accessToken,
  pick,
  api,
  gcpProjectId,
  resourceLabel
}: {
  url: string;
  accessToken: string;
  pick: (response: TResponse) => TItem[] | undefined;
  api: string;
  gcpProjectId?: string;
  resourceLabel: string;
}) => {
  const items: TItem[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const currentPageToken = pageToken;
    let data: TResponse;

    try {
      // eslint-disable-next-line no-await-in-loop
      ({ data } = await request.get<TResponse>(url, {
        params: new URLSearchParams({
          pageSize: String(GCP_PAGE_SIZE),
          ...(currentPageToken ? { pageToken: currentPageToken } : {})
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }));
    } catch (error) {
      throw toGcpDiscoveryError(error, { api, gcpProjectId });
    }

    items.push(...(pick(data) ?? []));
    pageToken = data.nextPageToken;
    page += 1;
  } while (pageToken && page < GCP_MAX_PAGES);

  if (pageToken) {
    logger.warn(
      { gcpProjectId, pagesFetched: page, itemsFetched: items.length },
      `Stopped listing ${resourceLabel} after ${GCP_MAX_PAGES} pages; some results were not returned`
    );
  }

  return items;
};

const isGcpServiceEnabled = async (accessToken: string, projectId: string, serviceName: string) => {
  try {
    const { data } = await request.get<GCPGetServiceRes>(
      `${IntegrationUrls.GCP_SERVICE_USAGE_URL}/v1/projects/${projectId}/services/${serviceName}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    return data.state === "ENABLED";
  } catch (error) {
    logger.warn(
      { projectId, serviceName, error: error instanceof Error ? error.message : "Unknown error" },
      "Could not determine whether a GCP service is enabled; treating the project as unavailable"
    );
    return false;
  }
};

export const getGcpCertificateManagerProjects = async (appConnection: TGcpConnection) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection);

  const apps = await fetchGcpPages<GCPGetProjectsRes, GCPApp>({
    url: `${IntegrationUrls.GCP_API_URL}/v1/projects`,
    accessToken,
    pick: (data) => data.projects,
    api: "Cloud Resource Manager",
    resourceLabel: "GCP projects"
  });

  const projects: { id: string; name: string }[] = [];

  for (let i = 0; i < apps.length; i += GCP_SERVICE_CHECK_CONCURRENCY) {
    const batch = apps.slice(i, i + GCP_SERVICE_CHECK_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const enabled = await Promise.all(
      batch.map((app) =>
        isGcpServiceEnabled(accessToken, app.projectId, IntegrationUrls.GCP_CERTIFICATE_MANAGER_SERVICE_NAME)
      )
    );

    batch.forEach((app, index) => {
      if (enabled[index]) projects.push({ id: app.projectId, name: app.name });
    });
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
};

export const getGcpCertificateManagerLocations = async (projectId: string, appConnection: TGcpConnection) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection);

  const locations = await fetchGcpPages<GCPGetProjectLocationsRes, GCPLocation>({
    url: `${IntegrationUrls.GCP_CERTIFICATE_MANAGER_URL}/v1/projects/${projectId}/locations`,
    accessToken,
    pick: (data) => data.locations,
    api: "Certificate Manager",
    gcpProjectId: projectId,
    resourceLabel: "GCP Certificate Manager locations"
  });

  const sorted = locations
    .filter((location) => Boolean(location.locationId))
    .sort((a, b) => a.locationId.localeCompare(b.locationId));

  return [
    ...sorted.filter((location) => location.locationId === GCP_GLOBAL_LOCATION),
    ...sorted.filter((location) => location.locationId !== GCP_GLOBAL_LOCATION)
  ].map((location) => ({
    locationId: location.locationId,
    displayName: location.displayName || location.locationId
  }));
};

export const getGcpCertificateMaps = async (projectId: string, appConnection: TGcpConnection) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection);

  const certificateMaps = await fetchGcpPages<GCPGetCertificateMapsRes, { name: string; description?: string }>({
    url: `${IntegrationUrls.GCP_CERTIFICATE_MANAGER_URL}/v1/projects/${projectId}/locations/${GCP_GLOBAL_LOCATION}/certificateMaps`,
    accessToken,
    pick: (data) => data.certificateMaps,
    api: "Certificate Manager",
    gcpProjectId: projectId,
    resourceLabel: "GCP certificate maps"
  });

  return certificateMaps
    .flatMap((certificateMap) => {
      const name = certificateMap.name.split("/").pop();
      return name ? [{ name, description: certificateMap.description }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};
