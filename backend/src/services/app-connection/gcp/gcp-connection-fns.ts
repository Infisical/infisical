import { STSClient } from "@aws-sdk/client-sts";
import { AxiosError } from "axios";
import { AwsClient, ExternalAccountClient, gaxios, Impersonated, JWT } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";
import RE2 from "re2";

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, GatewayTimeoutError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { getAppConnectionOidcSubject, getOidcIssuerUrl } from "@app/services/oidc-issuer/oidc-issuer-fns";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";
import { TSignOidcIssuerTokenDTO } from "@app/services/oidc-issuer/oidc-issuer-types";

import { AppConnection } from "../app-connection-enums";
import { GCP_GLOBAL_LOCATION, GCP_IAM_CREDENTIALS_URL, GCP_STS_TOKEN_URL } from "./gcp-connection-constants";
import { GcpConnectionMethod } from "./gcp-connection-enums";
import { isGcpServiceDisabledError, TGoogleApiError } from "./gcp-connection-errors";
import {
  GCPApp,
  GCPCloudDnsManagedZone,
  GCPGetCertificateMapsRes,
  GCPGetCloudDnsManagedZonesRes,
  GCPGetProjectLocationsRes,
  GCPGetProjectsRes,
  GCPGetServiceRes,
  GCPLocation,
  TGcpConnection,
  TGcpConnectionAuthDeps,
  TGcpConnectionConfig,
  TGcpConnectionFederatedCredential,
  TGcpConnectionForAuth,
  TGcpConnectionWorkloadIdentityFederationCredentials
} from "./gcp-connection-types";

export const getGcpConnectionListItem = () => {
  return {
    name: "GCP" as const,
    app: AppConnection.GCP as const,
    methods: Object.values(GcpConnectionMethod) as [
      GcpConnectionMethod.ServiceAccountImpersonation,
      GcpConnectionMethod.WorkloadIdentityFederation
    ]
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

const getGcpImpersonationAccessToken = async (
  serviceAccountEmail: string,
  instanceConfigService: Pick<TInstanceConfigService, "getOverridableEnv">
) => {
  const { INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL } = await instanceConfigService.getOverridableEnv();
  if (!INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
    throw new InternalServerError({
      message: `Environment variables have not been configured for GCP ${getAppConnectionMethodName(
        GcpConnectionMethod.ServiceAccountImpersonation
      )}`
    });
  }

  const sourceClient = buildGcpSourceCredential(INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL);

  const impersonatedCredentials = new Impersonated({
    sourceClient,
    targetPrincipal: serviceAccountEmail,
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
      `Failed to obtain GCP impersonated access token [serviceAccountEmail=${serviceAccountEmail}]`
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

const GCP_SERVICE_ACCOUNT_TOKEN_LIFETIME_SECONDS = 3600;
const GCP_TOKEN_REQUEST_TIMEOUT_MS = 30_000;
// GCP gives a federated token the expiry of the token Infisical signed, so this is also the federated token's
// lifetime. Without a service account it bounds how long one operation can run; longer runs need a service account.
const GCP_WORKLOAD_IDENTITY_TOKEN_TTL_SECONDS = 15 * 60;

type TGcpStsTokenResponse = { access_token: string; expires_in: number };
type TGcpStsErrorResponse = { error?: string; error_description?: string };
type TGcpGenerateAccessTokenResponse = { accessToken: string; expireTime: string };

const getGcpWorkloadIdentityAudience = (workloadIdentityProvider: string) =>
  `https://iam.googleapis.com/${workloadIdentityProvider}`;

const withoutTrailingPeriod = (text: string) => (text.endsWith(".") ? text.slice(0, -1) : text);

// Only a 4xx is GCP refusing the request. A timeout, network error or 5xx is GCP failing
const isGcpRefusal = (error: unknown) => {
  const status = error instanceof AxiosError ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500;
};

const toGcpUpstreamError = (error: unknown, service: string, detail: string) => {
  if (error instanceof AxiosError && (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT)) {
    return new GatewayTimeoutError({
      message: `${service} did not respond within ${GCP_TOKEN_REQUEST_TIMEOUT_MS / 1000} seconds. Try again later.`
    });
  }

  const status = error instanceof AxiosError ? error.response?.status : undefined;
  return new BadRequestError({
    message: `${service} could not complete the request${status ? ` (HTTP ${status})` : ""}: ${withoutTrailingPeriod(detail)}. Try again later.`
  });
};

export const getGcpConnectionFederatedCredential = ({
  id,
  orgId,
  workloadIdentityProvider
}: {
  id: string;
  orgId: string;
  workloadIdentityProvider: string;
}): TGcpConnectionFederatedCredential => {
  const { SITE_URL } = getConfig();

  return {
    issuerUrl: SITE_URL ? getOidcIssuerUrl(SITE_URL, orgId) : null,
    subjectIdentifier: getAppConnectionOidcSubject(id),
    audience: getGcpWorkloadIdentityAudience(workloadIdentityProvider)
  };
};

const exchangeGcpWorkloadIdentityToken = async (
  {
    appConnection,
    workloadIdentityProvider,
    serviceAccountEmail
  }: {
    appConnection: TSignOidcIssuerTokenDTO["appConnection"];
    workloadIdentityProvider: string;
    serviceAccountEmail?: string;
  },
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
): Promise<{ accessToken: string; expiresAt: number }> => {
  // GCP judges a token by when it was issued, so each exchange gets a freshly signed one
  const subjectToken = await oidcIssuerService.signToken({
    appConnection,
    audience: getGcpWorkloadIdentityAudience(workloadIdentityProvider),
    ttlSeconds: GCP_WORKLOAD_IDENTITY_TOKEN_TTL_SECONDS
  });

  let federatedToken: TGcpStsTokenResponse;
  try {
    const { data } = await request.post<TGcpStsTokenResponse>(
      GCP_STS_TOKEN_URL,
      {
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: `//iam.googleapis.com/${workloadIdentityProvider}`,
        scope: IntegrationUrls.GCP_CLOUD_PLATFORM_SCOPE,
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
        subjectToken
      },
      { timeout: GCP_TOKEN_REQUEST_TIMEOUT_MS }
    );
    federatedToken = data;
  } catch (error) {
    const body = error instanceof AxiosError ? (error.response?.data as TGcpStsErrorResponse | undefined) : undefined;
    const detail = body?.error_description || body?.error || (error instanceof Error ? error.message : "Unknown error");

    // Not the error itself: its request config holds the signed token
    logger.warn(
      {
        connectionId: appConnection.id,
        workloadIdentityProvider,
        status: error instanceof AxiosError ? error.response?.status : undefined,
        detail
      },
      `GCP Security Token Service token exchange failed [connectionId=${appConnection.id}] [workloadIdentityProvider=${workloadIdentityProvider}]`
    );
    if (!isGcpRefusal(error)) throw toGcpUpstreamError(error, "GCP's Security Token Service", detail);

    const { SITE_URL } = getConfig();
    const issuerUrl = SITE_URL ? getOidcIssuerUrl(SITE_URL, appConnection.orgId) : "this organization's issuer URL";

    throw new BadRequestError({
      message: `GCP workload identity provider '${workloadIdentityProvider}' rejected the connection's token: ${withoutTrailingPeriod(detail)}. Check that the provider exists and trusts the issuer '${issuerUrl}'.`
    });
  }

  if (!serviceAccountEmail) {
    return {
      accessToken: federatedToken.access_token,
      expiresAt: Date.now() + federatedToken.expires_in * 1000
    };
  }

  try {
    const { data } = await request.post<TGcpGenerateAccessTokenResponse>(
      `${GCP_IAM_CREDENTIALS_URL}/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
      {
        scope: [IntegrationUrls.GCP_CLOUD_PLATFORM_SCOPE],
        lifetime: `${GCP_SERVICE_ACCOUNT_TOKEN_LIFETIME_SECONDS}s`
      },
      { headers: { Authorization: `Bearer ${federatedToken.access_token}` }, timeout: GCP_TOKEN_REQUEST_TIMEOUT_MS }
    );

    return { accessToken: data.accessToken, expiresAt: new Date(data.expireTime).getTime() };
  } catch (error) {
    const status = error instanceof AxiosError ? error.response?.status : undefined;
    const body = error instanceof AxiosError ? (error.response?.data as TGoogleApiError | undefined) : undefined;
    const googleMessage = body?.error?.message;

    // Not the error itself: its request config holds the federated token
    logger.warn(
      { connectionId: appConnection.id, serviceAccountEmail, status, googleMessage },
      `GCP service account access token request failed [connectionId=${appConnection.id}] [serviceAccountEmail=${serviceAccountEmail}]`
    );

    if (!isGcpRefusal(error)) {
      throw toGcpUpstreamError(
        error,
        "GCP's IAM Service Account Credentials API",
        googleMessage ?? (error instanceof Error ? error.message : "Unknown error")
      );
    }

    if (isGcpServiceDisabledError(body, googleMessage ?? "")) {
      throw new BadRequestError({
        message: `GCP could not issue an access token for service account '${serviceAccountEmail}' because the IAM Service Account Credentials API (iamcredentials.googleapis.com) is not enabled: ${
          googleMessage ?? "service disabled"
        }`
      });
    }

    if (status === 403 || status === 404) {
      throw new BadRequestError({
        message: `GCP denied the connection access to service account '${serviceAccountEmail}'. Grant the Workload Identity User role (roles/iam.workloadIdentityUser) on the service account to the connection's principal, subject '${getAppConnectionOidcSubject(appConnection.id)}'.`
      });
    }

    throw new BadRequestError({
      message: `GCP could not issue an access token for service account '${serviceAccountEmail}': ${
        googleMessage ?? (error instanceof Error ? error.message : "Unknown error")
      }`
    });
  }
};

// Callers fetch one token per operation, so this is the least time an operation gets
const GCP_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const getGcpWorkloadIdentityAccessToken = async (
  connectionId: string,
  { appConnectionDAL, kmsDataKeyService, oidcIssuerService }: TGcpConnectionAuthDeps
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `GCP Connection with ID '${connectionId}' not found` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsDataKeyService,
    encryptedCredentials: appConnection.encryptedCredentials,
    projectId: appConnection.projectId
  })) as TGcpConnectionWorkloadIdentityFederationCredentials;

  if (
    credentials.accessToken &&
    credentials.expiresAt &&
    credentials.expiresAt > Date.now() + GCP_TOKEN_REFRESH_MARGIN_MS
  ) {
    return credentials.accessToken;
  }

  const token = await exchangeGcpWorkloadIdentityToken(
    {
      appConnection: {
        id: appConnection.id,
        name: appConnection.name,
        orgId: appConnection.orgId,
        projectId: appConnection.projectId
      },
      workloadIdentityProvider: credentials.workloadIdentityProvider,
      serviceAccountEmail: credentials.serviceAccountEmail
    },
    oidcIssuerService
  );

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: { ...credentials, ...token },
    orgId: appConnection.orgId,
    kmsDataKeyService,
    projectId: appConnection.projectId
  });

  await appConnectionDAL.update(
    { id: appConnection.id, encryptedCredentials: appConnection.encryptedCredentials },
    { encryptedCredentials }
  );

  return token.accessToken;
};

export const getGcpConnectionAuthToken = async (appConnection: TGcpConnectionForAuth, deps: TGcpConnectionAuthDeps) => {
  switch (appConnection.method) {
    case GcpConnectionMethod.ServiceAccountImpersonation:
      return getGcpImpersonationAccessToken(
        (appConnection.credentials as { serviceAccountEmail: string }).serviceAccountEmail,
        deps.instanceConfigService
      );
    case GcpConnectionMethod.WorkloadIdentityFederation:
      return getGcpWorkloadIdentityAccessToken(appConnection.id, deps);
    default:
      throw new InternalServerError({
        message: `Unhandled GCP connection method: ${appConnection.method as GcpConnectionMethod}`
      });
  }
};

export const getGcpSecretManagerProjects = async (appConnection: TGcpConnection, deps: TGcpConnectionAuthDeps) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

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

export const getGcpSecretManagerProjectLocations = async (
  projectId: string,
  appConnection: TGcpConnection,
  deps: TGcpConnectionAuthDeps
) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

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

export const validateGcpConnectionCredentials = async (
  appConnection: TGcpConnectionConfig,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">,
  instanceConfigService: Pick<TInstanceConfigService, "getOverridableEnv">
) => {
  switch (appConnection.method) {
    case GcpConnectionMethod.ServiceAccountImpersonation: {
      const { serviceAccountEmail } = appConnection.credentials;
      // Check if provided service account email suffix matches organization ID.
      // We do this to mitigate confused deputy attacks in multi-tenant instances
      if (serviceAccountEmail) {
        const expectedAccountIdSuffix = appConnection.orgId.split("-").slice(0, 2).join("-");
        const serviceAccountId = serviceAccountEmail.split("@")[0];
        if (!serviceAccountId.endsWith(expectedAccountIdSuffix)) {
          throw new BadRequestError({
            message: `GCP service account ID must have a suffix of "${expectedAccountIdSuffix}" e.g. service-account-${expectedAccountIdSuffix}@my-project.iam.gserviceaccount.com"`
          });
        }
      }

      await getGcpImpersonationAccessToken(serviceAccountEmail, instanceConfigService);

      return appConnection.credentials;
    }
    case GcpConnectionMethod.WorkloadIdentityFederation: {
      const { workloadIdentityProvider, serviceAccountEmail } = appConnection.credentials;

      // GCP fetches the issuer's keys over the internet and only accepts an https issuer
      const { SITE_URL } = getConfig();
      if (!SITE_URL?.startsWith("https://")) {
        throw new BadRequestError({
          message:
            "Workload Identity Federation requires SITE_URL to be this instance's public https URL, because GCP fetches the signing keys from it. Set SITE_URL and try again."
        });
      }

      // A new connection has no ID yet, so GCP cannot trust its subject. Reconnecting runs the exchange once the
      // customer has granted the connection's principal access.
      if (!appConnection.connection) return { workloadIdentityProvider, serviceAccountEmail };

      const token = await exchangeGcpWorkloadIdentityToken(
        {
          appConnection: {
            ...appConnection.connection,
            orgId: appConnection.orgId,
            projectId: appConnection.projectId
          },
          workloadIdentityProvider,
          serviceAccountEmail
        },
        oidcIssuerService
      );

      return { workloadIdentityProvider, serviceAccountEmail, ...token };
    }
    default:
      throw new InternalServerError({
        message: `Unhandled GCP connection method: ${(appConnection as { method: string }).method}`
      });
  }
};

const toGcpDiscoveryError = (error: unknown, context: { api: string; gcpProjectId?: string }) => {
  if (!(error instanceof AxiosError)) return error;

  const body = error.response?.data as TGoogleApiError | undefined;
  const message = body?.error?.message ?? error.message;
  const scope = context.gcpProjectId ? `GCP project "${context.gcpProjectId}"` : "your GCP project";

  if (error.response?.status === 403) {
    if (isGcpServiceDisabledError(body, message)) {
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
const TRAILING_DOT_REGEX = new RE2("\\.$");
const GCP_PAGE_SIZE = 100;
const GCP_SERVICE_CHECK_CONCURRENCY = 10;

const fetchGcpPages = async <TResponse extends { nextPageToken?: string }, TItem>({
  url,
  accessToken,
  pick,
  api,
  gcpProjectId,
  resourceLabel,
  pageSizeParam = "pageSize"
}: {
  url: string;
  accessToken: string;
  pick: (response: TResponse) => TItem[] | undefined;
  api: string;
  gcpProjectId?: string;
  resourceLabel: string;
  pageSizeParam?: string;
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
          [pageSizeParam]: String(GCP_PAGE_SIZE),
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

const getGcpProjectsWithServiceEnabled = async (
  appConnection: TGcpConnection,
  serviceName: string,
  deps: TGcpConnectionAuthDeps
) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

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
    const enabled = await Promise.all(batch.map((app) => isGcpServiceEnabled(accessToken, app.projectId, serviceName)));

    batch.forEach((app, index) => {
      if (enabled[index]) projects.push({ id: app.projectId, name: app.name });
    });
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
};

export const getGcpCertificateManagerProjects = async (appConnection: TGcpConnection, deps: TGcpConnectionAuthDeps) =>
  getGcpProjectsWithServiceEnabled(appConnection, IntegrationUrls.GCP_CERTIFICATE_MANAGER_SERVICE_NAME, deps);

export const getGcpCloudDnsProjects = async (appConnection: TGcpConnection, deps: TGcpConnectionAuthDeps) =>
  getGcpProjectsWithServiceEnabled(appConnection, IntegrationUrls.GCP_CLOUD_DNS_SERVICE_NAME, deps);

export const getGcpCloudDnsZones = async (
  projectId: string,
  appConnection: TGcpConnection,
  deps: TGcpConnectionAuthDeps
) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

  const zones = await fetchGcpPages<GCPGetCloudDnsManagedZonesRes, GCPCloudDnsManagedZone>({
    url: `${IntegrationUrls.GCP_CLOUD_DNS_URL}/dns/v1/projects/${projectId}/managedZones`,
    accessToken,
    pick: (data) => data.managedZones,
    api: "Cloud DNS",
    gcpProjectId: projectId,
    resourceLabel: "GCP Cloud DNS managed zones",
    pageSizeParam: "maxResults"
  });

  return zones
    .filter((zone) => zone.visibility !== "private")
    .map((zone) => ({
      id: `projects/${projectId}/managedZones/${zone.name}`,
      name: zone.name,
      dnsName: zone.dnsName.replace(TRAILING_DOT_REGEX, "")
    }))
    .sort((a, b) => a.dnsName.localeCompare(b.dnsName));
};

export const getGcpCertificateManagerLocations = async (
  projectId: string,
  appConnection: TGcpConnection,
  deps: TGcpConnectionAuthDeps
) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

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

export const getGcpCertificateMaps = async (
  projectId: string,
  appConnection: TGcpConnection,
  deps: TGcpConnectionAuthDeps
) => {
  const accessToken = await getGcpConnectionAuthToken(appConnection, deps);

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
