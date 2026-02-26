import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GitHubConnectionMethod } from "@app/services/app-connection/github/github-connection-enums";
import {
  getGitHubAppAuthToken,
  getGitHubGatewayConnectionDetails,
  getGitHubInstanceApiUrl,
  requestWithGitHubGateway
} from "@app/services/app-connection/github/github-connection-fns";
import { TGitHubConnection } from "@app/services/app-connection/github/github-connection-types";

import { NhiRemediationActionType } from "../nhi-enums";

type TGitHubRemediationResult = {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
};

type TGitHubRemediationConfig = {
  connection: TGitHubConnection;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

const getGitHubToken = async (config: TGitHubRemediationConfig): Promise<string> => {
  const { connection, gatewayService, gatewayV2Service } = config;
  const { credentials, method } = connection;

  switch (method) {
    case GitHubConnectionMethod.OAuth:
      return credentials.accessToken;
    case GitHubConnectionMethod.Pat:
      return credentials.personalAccessToken;
    default:
      return getGitHubAppAuthToken(connection, gatewayService, gatewayV2Service);
  }
};

const makeGitHubApiCall = async (config: TGitHubRemediationConfig, method: string, path: string): Promise<void> => {
  const { connection, gatewayService, gatewayV2Service } = config;
  const token = await getGitHubToken(config);
  const apiBaseUrl = await getGitHubInstanceApiUrl(connection);
  const url = `https://${apiBaseUrl}${path}`;

  const gatewayConnectionDetails = connection.gatewayId
    ? await getGitHubGatewayConnectionDetails(connection.gatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  await requestWithGitHubGateway(
    connection,
    gatewayService,
    gatewayV2Service,
    {
      url,
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    },
    gatewayConnectionDetails
  );
};

const deleteDeployKey = async (
  config: TGitHubRemediationConfig,
  metadata: Record<string, unknown>
): Promise<TGitHubRemediationResult> => {
  const repoFullName = metadata.repoFullName as string;
  const keyId = metadata.keyId as number;

  if (!repoFullName || !keyId) {
    return { success: false, message: "Missing repoFullName or keyId in identity metadata" };
  }

  await makeGitHubApiCall(config, "DELETE", `/repos/${encodeURIComponent(repoFullName)}/keys/${keyId}`);

  return {
    success: true,
    message: `Deploy key ${keyId} deleted from ${repoFullName}`,
    details: { repoFullName, keyId }
  };
};

const revokeFinegrainedPat = async (
  config: TGitHubRemediationConfig,
  metadata: Record<string, unknown>,
  externalId: string
): Promise<TGitHubRemediationResult> => {
  // externalId format: github-pat:orgName:patId
  const parts = externalId.split(":");
  if (parts.length < 3) {
    return { success: false, message: "Cannot parse PAT ID from externalId" };
  }
  const orgName = parts[1];
  const patId = parts[2];

  await makeGitHubApiCall(config, "DELETE", `/orgs/${encodeURIComponent(orgName)}/personal-access-tokens/${patId}`);

  return {
    success: true,
    message: `Fine-grained PAT ${patId} revoked in org ${orgName}`,
    details: { orgName, patId }
  };
};

const suspendAppInstallation = async (
  config: TGitHubRemediationConfig,
  _metadata: Record<string, unknown>,
  externalId: string
): Promise<TGitHubRemediationResult> => {
  // externalId format: github-app-installation:installationId
  const parts = externalId.split(":");
  if (parts.length < 2) {
    return { success: false, message: "Cannot parse installation ID from externalId" };
  }
  const installationId = parts[1];

  await makeGitHubApiCall(config, "PUT", `/app/installations/${installationId}/suspended`);

  return {
    success: true,
    message: `App installation ${installationId} has been suspended`,
    details: { installationId }
  };
};

export const executeGitHubRemediation = async (
  config: TGitHubRemediationConfig,
  actionType: NhiRemediationActionType,
  metadata: Record<string, unknown>,
  externalId: string
): Promise<TGitHubRemediationResult> => {
  switch (actionType) {
    case NhiRemediationActionType.DeleteDeployKey:
      return deleteDeployKey(config, metadata);
    case NhiRemediationActionType.RevokeFinegrainedPat:
      return revokeFinegrainedPat(config, metadata, externalId);
    case NhiRemediationActionType.SuspendAppInstallation:
      return suspendAppInstallation(config, metadata, externalId);
    default:
      return { success: false, message: `Unsupported GitHub remediation action: ${actionType}` };
  }
};
