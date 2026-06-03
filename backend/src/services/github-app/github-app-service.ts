import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";
import jwt from "jsonwebtoken";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  assertPlatformGitHubHostAllowed,
  getGitHubInstanceApiUrl,
  resolveGitHubAppCredentials
} from "@app/services/app-connection/github/github-connection-fns";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TGitHubAppDALFactory } from "./github-app-dal";
import {
  TDeleteGitHubAppDTO,
  TGetGitHubAppInstallationStatusDTO,
  TGitHubAppManifestResponse,
  TGitHubManifestStatePayload,
  TInitiateGitHubManifestDTO,
  TListGitHubAppsDTO,
  TSanitizedGitHubApp
} from "./github-app-types";

type TGitHubAppServiceFactoryDep = {
  gitHubAppDAL: TGitHubAppDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "countByGitHubApp">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TGitHubAppServiceFactory = ReturnType<typeof gitHubAppServiceFactory>;

export const gitHubAppServiceFactory = ({
  gitHubAppDAL,
  appConnectionDAL,
  permissionService,
  kmsService
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

    const connectionCounts = await appConnectionDAL.countByGitHubApp(orgPermission.orgId);
    const countByAppId = new Map(connectionCounts.map(({ gitHubAppId, count }) => [gitHubAppId, count]));

    const dbApps: TSanitizedGitHubApp[] = apps.map((app) => ({
      id: app.id,
      orgId: app.orgId,
      name: app.name,
      appId: app.appId,
      slug: app.slug,
      owner: app.owner ?? null,
      connectionCount: countByAppId.get(app.id) ?? 0,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    }));

    const { INF_APP_CONNECTION_GITHUB_APP_ID, INF_APP_CONNECTION_GITHUB_APP_SLUG } = getConfig();

    const sharedApp: TSanitizedGitHubApp | null =
      INF_APP_CONNECTION_GITHUB_APP_ID && INF_APP_CONNECTION_GITHUB_APP_SLUG
        ? {
            id: null,
            orgId: orgPermission.orgId,
            name: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            appId: INF_APP_CONNECTION_GITHUB_APP_ID,
            slug: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            owner: null,
            // connections referencing the instance-default app store a null gitHubAppId
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

    const appPrivateKey = privateKey
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    const now = Math.floor(Date.now() / 1000);
    const appJwt = crypto.jwt().sign({ iat: now, exp: now + 5 * 60, iss: appId }, appPrivateKey, {
      algorithm: "RS256"
    });

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${appJwt}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };

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

      const connectionCounts = await appConnectionDAL.countByGitHubApp(orgPermission.orgId, tx);
      const connectionCount = connectionCounts.find(({ gitHubAppId }) => gitHubAppId === existing.id)?.count ?? 0;

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
        owner: existing.owner ?? null,
        connectionCount: 0,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      };

      await gitHubAppDAL.deleteById(existing.id, tx);

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

    let statePayload: TGitHubManifestStatePayload;
    try {
      statePayload = jwt.verify(state, AUTH_SECRET) as TGitHubManifestStatePayload;
    } catch {
      throw new BadRequestError({ message: "Invalid or expired GitHub manifest state. Please try again." });
    }

    const { orgId, actorId, actorType, authMethod, name, instanceType, githubOrg, githubHost, installState } =
      statePayload;

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

    let manifestResponse: TGitHubAppManifestResponse;
    try {
      const resolvedApiHost = githubHost ? `https://${githubHost}/api/v3` : "https://api.github.com";
      // safeRequest validates + DNS-pins the target and disables redirects, so a public host
      // cannot redirect this exchange to an internal service (SSRF).
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

    let created: Awaited<ReturnType<typeof gitHubAppDAL.create>>;
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
        // Bind the app to the host/instance it was registered against. Every later credential
        // operation derives its target host from these stored values rather than from a
        // caller-supplied host, so a signed app JWT or the client secret can never be sent to an
        // arbitrary host an attacker controls.
        host: githubHost || null,
        instanceType
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A GitHub App with name "${name}" already exists in this organization.`
        });
      }
      throw err;
    }

    const callbackUrl = new URL(`${SITE_URL}/organizations/${orgId}/app-connections/github/manifest/callback`);
    callbackUrl.searchParams.set("gitHubAppId", created.id ?? "");
    callbackUrl.searchParams.set("slug", manifestResponse.slug);
    callbackUrl.searchParams.set("installState", installState);
    callbackUrl.searchParams.set("instanceType", instanceType);
    if (githubHost) {
      callbackUrl.searchParams.set("host", githubHost);
    }

    return { redirectUrl: callbackUrl.toString() };
  };

  // Checks whether a GitHub App already has installations. GitHub never redirects back from the
  // install page when the app is already installed, so the frontend uses this to route those
  // connections through the OAuth authorize flow instead. Also returns the app's (public) OAuth
  // client id needed to build the authorize URL.
  const getInstallationStatus = async ({
    gitHubAppId,
    orgPermission
  }: TGetGitHubAppInstallationStatusDTO): Promise<{ installed: boolean; clientId: string }> => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const {
      appId,
      clientId,
      privateKey,
      host: appHost,
      instanceType: appInstanceType
    } = await resolveGitHubAppCredentials(
      { gitHubAppId: gitHubAppId ?? null, orgId: orgPermission.orgId },
      { gitHubAppDAL, kmsService }
    );

    // The host/instance is never taken from the caller. For an org-managed app it is bound to the
    // stored app record; for the instance-default (shared) app there is no host env var to bind it
    // elsewhere, so it is only ever registered against the platform default host (github.com). This
    // is what prevents a settings reader from pointing the app's signed JWT at a host they control
    // to exfiltrate it.
    const effectiveHost = gitHubAppId ? (appHost ?? undefined) : undefined;
    const effectiveInstanceType = gitHubAppId ? (appInstanceType ?? "cloud") : "cloud";

    assertPlatformGitHubHostAllowed(effectiveHost);

    // validates the host against local/private addresses internally
    const apiBaseUrl = await getGitHubInstanceApiUrl({
      credentials: { host: effectiveHost, instanceType: effectiveInstanceType }
    });

    const appPrivateKey = privateKey
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    const now = Math.floor(Date.now() / 1000);
    const appJwt = crypto.jwt().sign({ iat: now, exp: now + 5 * 60, iss: appId }, appPrivateKey, {
      algorithm: "RS256"
    });

    try {
      // safeRequest validates + DNS-pins the target and disables redirects, so a public host
      // cannot redirect this request to an internal service (SSRF).
      const { data } = await safeRequest.get<{ id: number }[]>(`https://${apiBaseUrl}/app/installations`, {
        params: { per_page: 1 },
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${appJwt}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      return { installed: data.length > 0, clientId };
    } catch (err) {
      logger.error(err, `Failed to check GitHub App installation status [gitHubAppId=${gitHubAppId ?? "shared"}]`);
      throw new BadRequestError({
        message: "Unable to check GitHub App installation status. Verify the app still exists on GitHub."
      });
    }
  };

  return {
    initiateManifestCreation,
    handleManifestCallback,
    listGitHubApps,
    deleteGitHubApp,
    getInstallationStatus
  };
};
