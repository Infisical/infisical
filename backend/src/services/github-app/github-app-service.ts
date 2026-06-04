import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";
import jwt from "jsonwebtoken";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import {
  assertPlatformGitHubHostAllowed,
  buildGitHubAppJwtHeaders,
  getGitHubInstanceApiUrl,
  GithubTokenRespData,
  isGithubErrorResponse,
  resolveGitHubAppCredentials,
  signGitHubAppInstallationsToken,
  signGitHubAppJwt
} from "@app/services/app-connection/github/github-connection-fns";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TGitHubAppDALFactory } from "./github-app-dal";
import {
  TDeleteGitHubAppDTO,
  TGitHubAppInstallation,
  TGitHubAppManifestResponse,
  TGitHubManifestStatePayload,
  TInitiateGitHubManifestDTO,
  TListGitHubAppsDTO,
  TResolveGitHubAppInstallationsDTO,
  TSanitizedGitHubApp
} from "./github-app-types";

type TGitHubAppServiceFactoryDep = {
  gitHubAppDAL: TGitHubAppDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX" | "deleteItem">;
};

export type TGitHubAppServiceFactory = ReturnType<typeof gitHubAppServiceFactory>;

export const gitHubAppServiceFactory = ({
  gitHubAppDAL,
  permissionService,
  kmsService,
  keyStore
}: TGitHubAppServiceFactoryDep) => {
  const listGitHubApps = async ({ orgPermission }: TListGitHubAppsDTO): Promise<TSanitizedGitHubApp[]> => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const apps = await gitHubAppDAL.find({ orgId: orgPermission.orgId });

    const countByAppId = await gitHubAppDAL.countConnectionsPerApp(orgPermission.orgId);

    const dbApps: TSanitizedGitHubApp[] = apps.map((app) => ({
      id: app.id,
      orgId: app.orgId,
      name: app.name,
      appId: app.appId,
      slug: app.slug,
      clientId: app.clientId,
      owner: app.owner ?? null,
      connectionCount: countByAppId.get(app.id) ?? 0,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    }));

    const {
      INF_APP_CONNECTION_GITHUB_APP_ID,
      INF_APP_CONNECTION_GITHUB_APP_SLUG,
      INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID
    } = getConfig();

    const sharedApp: TSanitizedGitHubApp | null =
      INF_APP_CONNECTION_GITHUB_APP_ID && INF_APP_CONNECTION_GITHUB_APP_SLUG
        ? {
            id: null,
            orgId: orgPermission.orgId,
            name: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            appId: INF_APP_CONNECTION_GITHUB_APP_ID,
            slug: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            clientId: INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID ?? null,
            owner: null,
            connectionCount: countByAppId.get(null) ?? 0,
            createdAt: null,
            updatedAt: null
          }
        : null;

    return sharedApp ? [sharedApp, ...dbApps] : dbApps;
  };

  // Best-effort removal of every installation of the app on GitHub. Called after the local record
  // is deleted — at that point the app's private key is gone from Infisical, so any installation
  // left behind on GitHub could never be used again anyway. Failures are logged, never surfaced:
  // the user can always uninstall manually from GitHub.
  const uninstallAllGitHubAppInstallations = async (
    credentials: Awaited<ReturnType<typeof resolveGitHubAppCredentials>>,
    gitHubAppId: string
  ) => {
    const { appId, privateKey, host, instanceType } = credentials;

    // The host comes from the stored app record, never the caller — same binding as every other
    // credential operation on the app.
    assertPlatformGitHubHostAllowed(host ?? undefined);

    const apiBaseUrl = await getGitHubInstanceApiUrl({
      credentials: { host: host ?? undefined, instanceType: instanceType ?? "cloud" }
    });

    const appJwt = signGitHubAppJwt(appId, privateKey);
    const headers = buildGitHubAppJwtHeaders(appJwt);

    const installationIds: number[] = [];
    let page = 1;
    for (;;) {
      // safeRequest validates + DNS-pins the target and disables redirects (SSRF). Pages must be
      // fetched sequentially — we don't know the total count up front.
      // eslint-disable-next-line no-await-in-loop
      const { data } = await safeRequest.get<{ id: number }[]>(`https://${apiBaseUrl}/app/installations`, {
        params: { per_page: 100, page },
        headers
      });
      installationIds.push(...data.map((installation) => installation.id));
      if (data.length < 100) break;
      page += 1;
    }

    const results = await Promise.allSettled(
      installationIds.map((installationId) =>
        safeRequest.delete(`https://${apiBaseUrl}/app/installations/${installationId}`, { headers })
      )
    );

    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        // 404 means the installation is already gone — that's the desired end state.
        const reason = result.reason as AxiosError;
        if (reason?.response?.status !== 404) {
          logger.warn(
            { err: reason, installationId: installationIds[idx], gitHubAppId },
            `Failed to uninstall GitHub App installation [installationId=${installationIds[idx]}] [gitHubAppId=${gitHubAppId}]`
          );
        }
      }
    });
  };

  const deleteGitHubApp = async ({ id, orgPermission }: TDeleteGitHubAppDTO): Promise<TSanitizedGitHubApp> => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    // Resolve credentials up front — once the row is deleted the private key is gone and we can no
    // longer sign the app JWT needed to uninstall the app's installations on GitHub.
    let credentials: Awaited<ReturnType<typeof resolveGitHubAppCredentials>> | null = null;
    try {
      credentials = await resolveGitHubAppCredentials(
        { gitHubAppId: id, orgId: orgPermission.orgId },
        { gitHubAppDAL, kmsService }
      );
    } catch {
      // App missing or credentials unreadable — the transaction below still performs (or rejects)
      // the local deletion; only the GitHub-side uninstall is skipped.
    }

    const sanitized = await gitHubAppDAL.transaction(async (tx) => {
      const existing = await gitHubAppDAL.findByIdWithLock(id, orgPermission.orgId, tx);
      if (!existing) {
        throw new NotFoundError({ message: `GitHub App with id ${id} not found in this organization.` });
      }

      const connectionCounts = await gitHubAppDAL.countConnectionsPerApp(orgPermission.orgId, tx);
      const connectionCount = connectionCounts.get(existing.id) ?? 0;

      if (connectionCount > 0) {
        throw new BadRequestError({
          message: `Cannot delete GitHub App "${existing.name}" while it is in use by ${connectionCount} connection${
            connectionCount === 1 ? "" : "s"
          }. Remove those connections first.`
        });
      }

      const result: TSanitizedGitHubApp = {
        id: existing.id,
        orgId: existing.orgId,
        name: existing.name,
        appId: existing.appId,
        slug: existing.slug,
        clientId: existing.clientId,
        owner: existing.owner ?? null,
        connectionCount: 0,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      };

      try {
        await gitHubAppDAL.deleteById(existing.id, tx);
      } catch (err) {
        if (
          err instanceof DatabaseError &&
          (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
        ) {
          throw new BadRequestError({
            message: `Cannot delete GitHub App "${existing.name}" while it is in use by a connection. Remove those connections first.`
          });
        }
        throw err;
      }

      return result;
    });

    if (credentials) {
      try {
        await uninstallAllGitHubAppInstallations(credentials, id);
      } catch (err) {
        logger.warn(err, `Failed to uninstall GitHub App installations [gitHubAppId=${id}]`);
      }
    }

    return sanitized;
  };

  const initiateManifestCreation = async ({
    name,
    instanceType,
    githubOrg,
    githubHost,
    installState,
    orgPermission
  }: TInitiateGitHubManifestDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    assertPlatformGitHubHostAllowed(githubHost);

    const existing = await gitHubAppDAL.findOne({ orgId: orgPermission.orgId, name });
    if (existing) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" already exists in this organization.`
      });
    }

    const { AUTH_SECRET, SITE_URL } = getConfig();

    if (!SITE_URL) {
      throw new BadRequestError({
        message: "SITE_URL is not configured. Please set it in your environment to use GitHub App manifest creation."
      });
    }

    const stateToken = jwt.sign(
      {
        jti: crypto.nativeCrypto.randomUUID(),
        orgId: orgPermission.orgId,
        actorId: orgPermission.id,
        actorType: orgPermission.type,
        authMethod: orgPermission.authMethod,
        name,
        instanceType,
        githubOrg: githubOrg ?? "",
        githubHost: githubHost ?? "",
        installState
      } satisfies TGitHubManifestStatePayload,
      AUTH_SECRET,
      { expiresIn: "10m" }
    );

    const callbackUrl = `${SITE_URL}/api/v1/github-apps/manifest/callback`;
    const oauthCallbackUrl = `${SITE_URL}/organization/app-connections/github/oauth/callback`;

    const manifest = {
      name,
      url: SITE_URL,
      redirect_url: callbackUrl,
      callback_urls: [oauthCallbackUrl],
      description: "Infisical GitHub App Connection",
      public: false,
      request_oauth_on_install: true,
      default_permissions: {
        metadata: "read",
        secrets: "write",
        environments: "write",
        actions: "read",
        organization_secrets: "write"
      },
      default_events: [] as string[]
    };

    const resolvedHost = githubHost ? `https://${githubHost}` : "https://github.com";
    const githubActionUrl = githubOrg
      ? `${resolvedHost}/organizations/${encodeURIComponent(githubOrg)}/settings/apps/new`
      : `${resolvedHost}/settings/apps/new`;

    return { state: stateToken, manifest, githubActionUrl };
  };

  const handleManifestCallback = async ({ code, state }: { code: string; state: string }) => {
    const { AUTH_SECRET, SITE_URL } = getConfig();

    if (!SITE_URL) {
      throw new BadRequestError({ message: "SITE_URL is not configured." });
    }

    let statePayload: TGitHubManifestStatePayload & { exp: number };
    try {
      statePayload = jwt.verify(state, AUTH_SECRET) as TGitHubManifestStatePayload & { exp: number };
    } catch {
      throw new BadRequestError({ message: "Invalid or expired GitHub manifest state. Please try again." });
    }

    const { jti, exp, orgId, actorId, actorType, authMethod, name, instanceType, githubOrg, githubHost, installState } =
      statePayload;

    if (!jti) {
      throw new BadRequestError({ message: "Invalid or expired GitHub manifest state. Please try again." });
    }
    const ttlSeconds = Math.max(1, exp - Math.floor(Date.now() / 1000));
    const claimed = await keyStore.setItemWithExpiryNX(KeyStorePrefixes.UsedGitHubManifestState(jti), ttlSeconds, "1");
    if (!claimed) {
      throw new BadRequestError({
        message: "This GitHub manifest registration link has already been used. Please try again."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: actorType as ActorType,
      actorId,
      orgId,
      actorAuthMethod: authMethod as ActorAuthMethod,
      actorOrgId: orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const existingByName = await gitHubAppDAL.findOne({ orgId, name });
    if (existingByName) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" already exists in this organization.`
      });
    }

    assertPlatformGitHubHostAllowed(githubHost);

    const nameLockKey = KeyStorePrefixes.GitHubManifestNameLock(orgId, name);
    const nameLockClaimed = await keyStore.setItemWithExpiryNX(nameLockKey, 60, "1");
    if (!nameLockClaimed) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" is already being registered in this organization.`
      });
    }

    let created: Awaited<ReturnType<typeof gitHubAppDAL.create>>;
    try {
      let manifestResponse: TGitHubAppManifestResponse;
      try {
        const resolvedApiHost = githubHost ? `https://${githubHost}/api/v3` : "https://api.github.com";
        const { data } = await safeRequest.post<TGitHubAppManifestResponse>(
          `${resolvedApiHost}/app-manifests/${encodeURIComponent(code)}/conversions`,
          {},
          {
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28"
            }
          }
        );
        manifestResponse = data;
      } catch {
        throw new BadRequestError({
          message:
            "Failed to exchange GitHub App manifest code. The code may be expired or invalid. Please try registering the GitHub App again."
        });
      }

      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId
      });

      const owner = manifestResponse.owner?.login ?? (githubOrg || null);

      try {
        created = await gitHubAppDAL.create({
          orgId,
          name,
          appId: String(manifestResponse.id),
          clientId: manifestResponse.client_id,
          encryptedClientSecret: encryptor({ plainText: Buffer.from(manifestResponse.client_secret) }).cipherTextBlob,
          encryptedPrivateKey: encryptor({ plainText: Buffer.from(manifestResponse.pem) }).cipherTextBlob,
          slug: manifestResponse.slug,
          owner,
          host: githubHost || null,
          instanceType
        });
      } catch (err) {
        logger.error(
          { err, orgId, appId: manifestResponse.id, slug: manifestResponse.slug },
          `Failed to store GitHub App after manifest conversion; the app must be deleted manually on GitHub [orgId=${orgId}] [appId=${manifestResponse.id}] [slug=${manifestResponse.slug}] [url=${manifestResponse.html_url}]`
        );
        if (
          err instanceof DatabaseError &&
          (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation
        ) {
          throw new BadRequestError({
            message: `A GitHub App with name "${name}" already exists in this organization. Note: a duplicate app was still created on GitHub (${manifestResponse.html_url}) — please delete it from your GitHub app settings.`
          });
        }
        throw err;
      }
    } finally {
      await keyStore.deleteItem(nameLockKey).catch(() => {});
    }

    const callbackUrl = new URL(`${SITE_URL}/organizations/${orgId}/app-connections/github/manifest/callback`);
    callbackUrl.searchParams.set("gitHubAppId", created.id ?? "");
    callbackUrl.searchParams.set("slug", created.slug);
    callbackUrl.searchParams.set("installState", installState);
    callbackUrl.searchParams.set("instanceType", instanceType);
    if (githubHost) {
      callbackUrl.searchParams.set("host", githubHost);
    }

    return { redirectUrl: callbackUrl.toString() };
  };

  const resolveUserInstallations = async ({
    code,
    gitHubAppId,
    host,
    instanceType,
    projectId,
    orgPermission
  }: TResolveGitHubAppInstallationsDTO): Promise<{
    installations: TGitHubAppInstallation[];
    installationsToken: string;
  }> => {
    // mirror the permission required to create the connection this flow feeds into
    if (projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: orgPermission.type,
        actorId: orgPermission.id,
        projectId,
        actorAuthMethod: orgPermission.authMethod,
        actorOrgId: orgPermission.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Create,
        ProjectPermissionSub.AppConnections
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actor: orgPermission.type,
        actorId: orgPermission.id,
        orgId: orgPermission.orgId,
        actorAuthMethod: orgPermission.authMethod,
        actorOrgId: orgPermission.orgId,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Create,
        OrgPermissionSubjects.AppConnections
      );
    }

    const { SITE_URL } = getConfig();
    if (!SITE_URL) {
      throw new BadRequestError({ message: "SITE_URL is not configured." });
    }

    const {
      appId,
      clientId,
      clientSecret,
      host: appHost,
      instanceType: appInstanceType
    } = await resolveGitHubAppCredentials(
      { gitHubAppId: gitHubAppId ?? null, orgId: orgPermission.orgId },
      {
        gitHubAppDAL,
        kmsService
      }
    );

    const effectiveHost = gitHubAppId ? (appHost ?? undefined) : host || undefined;
    const effectiveInstanceType: "cloud" | "server" = gitHubAppId
      ? (appInstanceType ?? "cloud")
      : (instanceType ?? "cloud");

    assertPlatformGitHubHostAllowed(effectiveHost);

    const oauthHost = effectiveHost ?? "github.com";

    let tokenData: GithubTokenRespData;
    try {
      const { data } = await safeRequest.post<GithubTokenRespData>(
        `https://${oauthHost}/login/oauth/access_token`,
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${SITE_URL}/organization/app-connections/github/oauth/callback`
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        }
      );
      tokenData = data;
    } catch (err) {
      logger.error(err, `Failed to exchange GitHub OAuth code [gitHubAppId=${gitHubAppId ?? "shared"}]`);
      throw new BadRequestError({
        message: "Unable to authorize with GitHub. The code may be expired or invalid. Please try again."
      });
    }

    if (isGithubErrorResponse(tokenData) || !tokenData.access_token) {
      throw new BadRequestError({
        message: "Unable to authorize with GitHub. The code may be expired or invalid. Please try again."
      });
    }

    const apiBaseUrl = await getGitHubInstanceApiUrl({
      credentials: { host: effectiveHost, instanceType: effectiveInstanceType }
    });

    type TUserInstallation = {
      id: number;
      app_id: number;
      account: { login: string; type: string };
    };

    const installations: TUserInstallation[] = [];
    const MAX_PAGES = 100;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data } = await safeRequest.get<{ installations: TUserInstallation[] }>(
        `https://${apiBaseUrl}/user/installations`,
        {
          params: { per_page: 100, page },
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${tokenData.access_token}`,
            "X-GitHub-Api-Version": "2022-11-28"
          }
        }
      );

      const pageInstallations = data.installations ?? [];
      installations.push(...pageInstallations);

      if (pageInstallations.length < 100) {
        break;
      }
    }

    const appInstallations = installations.filter((installation) => String(installation.app_id) === appId);

    const installationsToken = signGitHubAppInstallationsToken({
      jti: crypto.nativeCrypto.randomUUID(),
      orgId: orgPermission.orgId,
      actorId: orgPermission.id,
      gitHubAppId: gitHubAppId ?? null,
      host: effectiveHost ?? "",
      instanceType: effectiveInstanceType,
      installationIds: appInstallations.map((installation) => String(installation.id))
    });

    return {
      installations: appInstallations.map((installation) => ({
        id: String(installation.id),
        accountLogin: installation.account.login,
        accountType: installation.account.type
      })),
      installationsToken
    };
  };

  return {
    initiateManifestCreation,
    handleManifestCallback,
    listGitHubApps,
    deleteGitHubApp,
    resolveUserInstallations
  };
};
