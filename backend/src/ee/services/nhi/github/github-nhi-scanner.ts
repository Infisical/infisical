import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { makePaginatedGitHubRequest } from "@app/services/app-connection/github/github-connection-fns";
import { TGitHubConnection } from "@app/services/app-connection/github/github-connection-types";

import { NhiIdentityType, NhiProvider } from "../nhi-enums";
import { TRawNhiIdentity } from "../nhi-scanner-types";

type TGitHubScanConfig = {
  connection: TGitHubConnection;
  orgName: string;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

// --- GitHub API response types ---

type TGitHubAppInstallation = {
  id: number;
  app_id: number;
  app_slug: string;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
  repository_selection: string;
  account: { login: string; id: number; type: string } | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
};

type TGitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
};

type TGitHubDeployKey = {
  id: number;
  key: string;
  title: string;
  read_only: boolean;
  verified: boolean;
  created_at: string;
};

type TGitHubPat = {
  id: number;
  owner: { login: string; id: number };
  repository_selection: string;
  permissions: {
    repository?: Record<string, string>;
    organization?: Record<string, string>;
  };
  access_granted_at: string;
  token_expired: boolean;
  token_expires_at: string | null;
  token_last_used_at: string | null;
};

// --- Scanners ---

const scanAppInstallations = async (config: TGitHubScanConfig): Promise<TRawNhiIdentity[]> => {
  const { connection, orgName, gatewayService, gatewayV2Service } = config;

  let installations: TGitHubAppInstallation[];
  try {
    installations = await makePaginatedGitHubRequest<TGitHubAppInstallation>(
      connection,
      gatewayService,
      gatewayV2Service,
      `/orgs/${encodeURIComponent(orgName)}/installations`
    );
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) {
      logger.info(`App installation listing not available for org ${orgName} (status ${status})`);
      return [];
    }
    throw err;
  }

  return installations.map((inst) => {
    const permissions = inst.permissions || {};
    const policies = Object.entries(permissions).map(([scope, level]) => `${scope}:${level}`);

    return {
      externalId: `github-app-installation:${inst.id}`,
      name: inst.app_slug || `app-${inst.id}`,
      type: NhiIdentityType.GitHubAppInstallation,
      provider: NhiProvider.GitHub,
      metadata: {
        appId: inst.app_id,
        appSlug: inst.app_slug,
        permissions,
        events: inst.events,
        repositorySelection: inst.repository_selection,
        targetType: inst.target_type,
        account: inst.account,
        suspendedAt: inst.suspended_at
      },
      policies,
      keyCreateDate: inst.created_at ? new Date(inst.created_at) : null,
      lastActivityAt: inst.updated_at ? new Date(inst.updated_at) : null
    };
  });
};

const DEPLOY_KEY_CONCURRENCY = 10;

const scanDeployKeys = async (config: TGitHubScanConfig): Promise<TRawNhiIdentity[]> => {
  const { connection, orgName, gatewayService, gatewayV2Service } = config;

  let repos: TGitHubRepo[];
  try {
    repos = await makePaginatedGitHubRequest<TGitHubRepo>(
      connection,
      gatewayService,
      gatewayV2Service,
      `/orgs/${encodeURIComponent(orgName)}/repos`
    );
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) {
      logger.info(`Repository listing not available for org ${orgName} (status ${status})`);
      return [];
    }
    throw err;
  }

  const identities: TRawNhiIdentity[] = [];

  // Process repos in batches to manage rate limits
  for (let i = 0; i < repos.length; i += DEPLOY_KEY_CONCURRENCY) {
    const batch = repos.slice(i, i + DEPLOY_KEY_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        try {
          const keys = await makePaginatedGitHubRequest<TGitHubDeployKey>(
            connection,
            gatewayService,
            gatewayV2Service,
            `/repos/${encodeURIComponent(repo.full_name)}/keys`
          );

          return keys.map((key) => ({
            externalId: `github-deploy-key:${repo.full_name}:${key.id}`,
            name: `${repo.full_name}/${key.title || `key-${key.id}`}`,
            type: NhiIdentityType.GitHubDeployKey as const,
            provider: NhiProvider.GitHub as const,
            metadata: {
              repoFullName: repo.full_name,
              keyId: key.id,
              title: key.title,
              readOnly: key.read_only,
              verified: key.verified
            },
            policies: key.read_only ? ["contents:read"] : ["contents:write"],
            keyCreateDate: key.created_at ? new Date(key.created_at) : null,
            keyLastUsedDate: null as Date | null,
            lastActivityAt: null as Date | null
          }));
        } catch (err) {
          logger.warn(err, `Failed to fetch deploy keys for repo ${repo.full_name}`);
          return [];
        }
      })
    );

    for (const result of batchResults) {
      identities.push(...result);
    }
  }

  return identities;
};

const scanFinegrainedPats = async (config: TGitHubScanConfig): Promise<TRawNhiIdentity[]> => {
  const { connection, orgName, gatewayService, gatewayV2Service } = config;

  let pats: TGitHubPat[];
  try {
    pats = await makePaginatedGitHubRequest<TGitHubPat>(
      connection,
      gatewayService,
      gatewayV2Service,
      `/orgs/${encodeURIComponent(orgName)}/personal-access-tokens`
    );
  } catch (err: unknown) {
    // 404/403 means the org doesn't have this feature enabled or insufficient permissions
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) {
      logger.info(`Fine-grained PAT listing not available for org ${orgName} (status ${status})`);
      return [];
    }
    throw err;
  }

  return pats.map((pat) => {
    const repoPerms = pat.permissions?.repository || {};
    const orgPerms = pat.permissions?.organization || {};
    const policies = [
      ...Object.entries(repoPerms).map(([scope, level]) => `repo:${scope}:${level}`),
      ...Object.entries(orgPerms).map(([scope, level]) => `org:${scope}:${level}`)
    ];

    return {
      externalId: `github-pat:${orgName}:${pat.id}`,
      name: `${pat.owner.login}/pat-${pat.id}`,
      type: NhiIdentityType.GitHubFinegrainedPat,
      provider: NhiProvider.GitHub,
      metadata: {
        owner: pat.owner,
        repositorySelection: pat.repository_selection,
        permissions: pat.permissions,
        tokenExpired: pat.token_expired,
        tokenExpiresAt: pat.token_expires_at,
        tokenLastUsedAt: pat.token_last_used_at
      },
      policies,
      keyCreateDate: pat.access_granted_at ? new Date(pat.access_granted_at) : null,
      keyLastUsedDate: pat.token_last_used_at ? new Date(pat.token_last_used_at) : null,
      lastActivityAt: pat.token_last_used_at ? new Date(pat.token_last_used_at) : null
    };
  });
};

// --- Entry point ---

export const scanGitHubOrgIdentities = async (config: TGitHubScanConfig): Promise<TRawNhiIdentity[]> => {
  const results = await Promise.allSettled([
    scanAppInstallations(config),
    scanDeployKeys(config),
    scanFinegrainedPats(config)
  ]);

  const identities: TRawNhiIdentity[] = [];
  const scannerNames = ["App Installations", "Deploy Keys", "Fine-grained PATs"];

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.status === "fulfilled") {
      identities.push(...result.value);
    } else {
      logger.warn(result.reason, `GitHub NHI scanner failed for ${scannerNames[i]} in org ${config.orgName}`);
    }
  }

  return identities;
};
