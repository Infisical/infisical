import { AxiosError, AxiosRequestConfig } from "axios";

import { OrganizationActionScope } from "@app/db/schemas";
import { TActorContext, TActorContexts } from "@app/domains/lib/actor-context";
import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionGatewayActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import {
  assertPlatformGitHubHostAllowed,
  buildGitHubAppJwtHeaders,
  getGitHubGatewayConnectionDetails,
  getGitHubInstanceApiUrl,
  requestWithGitHubGateway,
  resolveGitHubAppCredentials,
  sanitizeGitHubAxiosError,
  signGitHubAppJwt
} from "@app/services/app-connection/github/github-connection-fns";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGitHubAppDALFactory } from "./github-app-dal";
import {
  TDeleteGitHubAppDTO,
  TGitHubAppManifestResponse,
  TGitHubManifestStatePayload,
  THandleManifestCallbackDTO,
  TInitiateGitHubManifestDTO,
  TListGitHubAppsDTO,
  TSanitizedGitHubApp
} from "./github-app-types";

type TGitHubAppServiceFactoryDep = {
  gitHubAppDAL: TGitHubAppDALFactory;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  actorContexts: Pick<TActorContexts, "forPrincipal">;
  kmsCoreDomain: TKmsCoreDomain;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX" | "deleteItem">;
  licenseDomain: TLicenseDomain;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<
    TGatewayPoolServiceFactory,
    "resolveAttachableGatewayFromPool" | "resolveEffectiveGatewayId"
  >;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TGitHubAppServiceFactory = ReturnType<typeof gitHubAppServiceFactory>;

export const gitHubAppServiceFactory = ({
  gitHubAppDAL,
  organizationsDomain,
  projectsDomain,
  actorContexts,
  kmsCoreDomain,
  keyStore,
  licenseDomain,
  gatewayV2Service,
  gatewayPoolService,
  gatewayV2DAL,
  auditLogService,
  userDAL
}: TGitHubAppServiceFactoryDep) => {
  const checkAppConnectionPermission = async ({
    actor,
    projectId,
    orgAction,
    projectAction,
    orgScope
  }: {
    actor: TActorContext;
    projectId: string | null | undefined;
    orgAction: OrgPermissionAppConnectionActions;
    projectAction: ProjectPermissionAppConnectionActions;
    orgScope: OrganizationActionScope;
  }) => {
    if (projectId) {
      const permission = await projectsDomain.getProjectPermission({ actor, projectId });

      permission.assert({ action: projectAction, subject: ProjectPermissionSub.AppConnections });
    } else {
      const permission = await organizationsDomain.getOrgPermission({ actor, scope: orgScope });

      permission.assert({ action: orgAction, subject: OrgPermissionSubjects.AppConnections });
    }
  };

  // Validates that the actor may attach the given gateway and that it exists for the org.
  // Lets the manifest exchange route through a gateway when the GitHub host (e.g. a private
  // GitHub Enterprise Server) isn't directly reachable from the Infisical backend.
  const assertGatewayUsable = async (gatewayId: string, actor: TActorContext) => {
    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan.gateway) {
      throw new BadRequestError({
        message:
          "Your current plan does not support gateway usage with app connections. Please upgrade your plan or contact Infisical Sales for assistance."
      });
    }

    const permission = await organizationsDomain.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionGatewayActions.AttachGateways, subject: OrgPermissionSubjects.Gateway });

    const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actor.org.id });
    if (!gatewayV2) {
      throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    }
  };

  const assertGatewayConfigUsable = async (
    { gatewayId, gatewayPoolId }: { gatewayId?: string | null; gatewayPoolId?: string | null },
    actor: TActorContext
  ) => {
    if (gatewayId) {
      await assertGatewayUsable(gatewayId, actor);
      return;
    }
    if (gatewayPoolId) {
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actor.org.id,
        actor
      });
    }
  };

  const listGitHubApps = async ({ actor, projectId }: TListGitHubAppsDTO): Promise<TSanitizedGitHubApp[]> => {
    await checkAppConnectionPermission({
      actor,
      projectId,
      orgAction: OrgPermissionAppConnectionActions.Read,
      projectAction: ProjectPermissionAppConnectionActions.Read,
      orgScope: OrganizationActionScope.Any
    });

    let includeOrgApps = true;
    if (projectId) {
      const permission = await organizationsDomain.getOrgPermission({ actor });
      includeOrgApps = permission.can({
        action: OrgPermissionAppConnectionActions.Connect,
        subject: OrgPermissionSubjects.AppConnections
      });
    }

    const orgApps = includeOrgApps ? await gitHubAppDAL.find({ orgId: actor.org.id, projectId: null }) : [];
    const projectApps = projectId ? await gitHubAppDAL.find({ orgId: actor.org.id, projectId }) : [];
    const apps = [...orgApps, ...projectApps];

    const countByAppId = await gitHubAppDAL.countConnectionsPerApp(actor.org.id);

    const dbApps: TSanitizedGitHubApp[] = apps.map((app) => ({
      id: app.id,
      orgId: app.orgId,
      projectId: app.projectId ?? null,
      name: app.name,
      appId: app.appId,
      slug: app.slug,
      clientId: app.clientId,
      owner: app.owner ?? null,
      host: app.host ?? null,
      instanceType: app.instanceType === "server" ? "server" : "cloud",
      connectionCount: countByAppId.get(app.id) ?? 0,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt
    }));

    const {
      INF_APP_CONNECTION_GITHUB_APP_ID,
      INF_APP_CONNECTION_GITHUB_APP_SLUG,
      INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
      INF_APP_CONNECTION_GITHUB_APP_HOST
    } = getConfig();

    const sharedApp: TSanitizedGitHubApp | null =
      INF_APP_CONNECTION_GITHUB_APP_ID && INF_APP_CONNECTION_GITHUB_APP_SLUG
        ? {
            id: null,
            orgId: actor.org.id,
            projectId: null,
            name: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            appId: INF_APP_CONNECTION_GITHUB_APP_ID,
            slug: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            clientId: INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID ?? null,
            owner: null,
            host: INF_APP_CONNECTION_GITHUB_APP_HOST ?? null,
            instanceType: null,
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

  const deleteGitHubApp = async ({ id, actor }: TDeleteGitHubAppDTO): Promise<TSanitizedGitHubApp> => {
    const app = await gitHubAppDAL.findOne({ id, orgId: actor.org.id });
    if (!app) {
      throw new NotFoundError({ message: `GitHub App with id ${id} not found in this organization.` });
    }

    await checkAppConnectionPermission({
      actor,
      projectId: app.projectId,
      orgAction: OrgPermissionAppConnectionActions.Delete,
      projectAction: ProjectPermissionAppConnectionActions.Delete,
      orgScope: OrganizationActionScope.Any
    });

    // Resolve credentials up front — once the row is deleted the private key is gone and we can no
    // longer sign the app JWT needed to uninstall the app's installations on GitHub.
    let credentials: Awaited<ReturnType<typeof resolveGitHubAppCredentials>> | null = null;
    try {
      credentials = await resolveGitHubAppCredentials(
        { gitHubAppId: id, orgId: actor.org.id },
        { gitHubAppDAL, kmsCoreDomain }
      );
    } catch {
      // App missing or credentials unreadable — the transaction below still performs (or rejects)
      // the local deletion; only the GitHub-side uninstall is skipped.
    }

    const sanitized = await gitHubAppDAL.transaction(async (tx) => {
      const existing = await gitHubAppDAL.findByIdWithLock(id, actor.org.id, tx);
      if (!existing) {
        throw new NotFoundError({ message: `GitHub App with id ${id} not found in this organization.` });
      }

      const connectionCounts = await gitHubAppDAL.countConnectionsPerApp(actor.org.id, tx);
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
        projectId: existing.projectId ?? null,
        name: existing.name,
        appId: existing.appId,
        slug: existing.slug,
        clientId: existing.clientId,
        owner: existing.owner ?? null,
        host: existing.host ?? null,
        instanceType: existing.instanceType === "server" ? "server" : "cloud",
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
    projectId,
    gatewayId,
    gatewayPoolId,
    actor
  }: TInitiateGitHubManifestDTO) => {
    await checkAppConnectionPermission({
      actor,
      projectId,
      orgAction: OrgPermissionAppConnectionActions.Create,
      projectAction: ProjectPermissionAppConnectionActions.Create,
      orgScope: OrganizationActionScope.Any
    });

    assertPlatformGitHubHostAllowed(githubHost);

    await assertGatewayConfigUsable({ gatewayId, gatewayPoolId }, actor);

    const existing = await gitHubAppDAL.findOne({
      orgId: actor.org.id,
      projectId: projectId ?? null,
      name
    });
    if (existing) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" already exists in this ${projectId ? "project" : "organization"}.`
      });
    }

    const { AUTH_SECRET, SITE_URL } = getConfig();

    if (!SITE_URL) {
      throw new BadRequestError({
        message: "SITE_URL is not configured. Please set it in your environment to use GitHub App manifest creation."
      });
    }

    const stateToken = crypto.jwt().sign(
      {
        jti: crypto.nativeCrypto.randomUUID(),
        orgId: actor.org.id,
        projectId: projectId ?? null,
        actorId: actor.principal.id,
        actorType: actor.principal.type,
        authMethod: actor.principal.type === ActorType.USER ? actor.principal.authMethod : null,
        name,
        instanceType,
        githubOrg: githubOrg ?? "",
        githubHost: githubHost ?? "",
        gatewayId: gatewayId ?? null,
        gatewayPoolId: gatewayPoolId ?? null,
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
        organization_secrets: "write",
        dependabot_secrets: "write",
        organization_dependabot_secrets: "write",
        // GitHub Enterprise Server has no Codespaces, so these permissions do not exist there
        ...(instanceType !== "server" && {
          codespaces_secrets: "write",
          organization_codespaces_secrets: "write"
        })
      },
      default_events: [] as string[]
    };

    const resolvedHost = githubHost ? `https://${githubHost}` : "https://github.com";
    const githubActionUrl = githubOrg
      ? `${resolvedHost}/organizations/${encodeURIComponent(githubOrg)}/settings/apps/new`
      : `${resolvedHost}/settings/apps/new`;

    return { state: stateToken, manifest, githubActionUrl };
  };

  const handleManifestCallback = async ({ code, state, auditLogInfo }: THandleManifestCallbackDTO) => {
    const { AUTH_SECRET, SITE_URL } = getConfig();

    if (!SITE_URL) {
      throw new BadRequestError({ message: "SITE_URL is not configured." });
    }

    let statePayload: TGitHubManifestStatePayload & { exp: number };
    try {
      statePayload = crypto.jwt().verify(state, AUTH_SECRET) as TGitHubManifestStatePayload & { exp: number };
    } catch {
      throw new BadRequestError({ message: "Invalid or expired GitHub manifest state. Please try again." });
    }

    const {
      jti,
      exp,
      orgId,
      projectId = null,
      actorId,
      actorType,
      authMethod,
      name,
      instanceType,
      githubOrg,
      githubHost,
      gatewayId = null,
      gatewayPoolId = null,
      installState
    } = statePayload;

    if (!jti) {
      throw new BadRequestError({ message: "Invalid or expired GitHub manifest state. Please try again." });
    }
    const ttlSeconds = Math.max(1, exp - Math.floor(Date.now() / 1000));
    const stateClaimKey = KeyStorePrefixes.UsedGitHubManifestState(jti);
    const claimed = await keyStore.setItemWithExpiryNX(stateClaimKey, ttlSeconds, "1");
    if (!claimed) {
      throw new BadRequestError({
        message: "This GitHub manifest registration link has already been used. Please try again."
      });
    }

    let created: Awaited<ReturnType<typeof gitHubAppDAL.create>>;
    let codeExchanged = false;
    try {
      const stateUser = actorType === ActorType.USER ? await userDAL.findById(actorId) : undefined;
      if (!stateUser) {
        throw new BadRequestError({ message: "Invalid actor provided", name: "Get permission" });
      }
      const actor = await actorContexts.forPrincipal(
        {
          type: ActorType.USER,
          id: stateUser.id,
          username: stateUser.username,
          email: stateUser.email ?? null,
          authMethod: authMethod as AuthMethod | null,
          isSuperAdmin: Boolean(stateUser.superAdmin)
        },
        orgId
      );
      await checkAppConnectionPermission({
        actor,
        projectId,
        orgAction: OrgPermissionAppConnectionActions.Create,
        projectAction: ProjectPermissionAppConnectionActions.Create,
        orgScope: OrganizationActionScope.Any
      });

      const existingByName = await gitHubAppDAL.findOne({ orgId, projectId, name });
      if (existingByName) {
        throw new BadRequestError({
          message: `A GitHub App with name "${name}" already exists in this ${projectId ? "project" : "organization"}.`
        });
      }

      assertPlatformGitHubHostAllowed(githubHost);

      const nameLockKey = KeyStorePrefixes.GitHubManifestNameLock(orgId, projectId, name);
      const nameLockClaimed = await keyStore.setItemWithExpiryNX(nameLockKey, 60, "1");
      if (!nameLockClaimed) {
        throw new BadRequestError({
          message: `A GitHub App with name "${name}" is already being registered in this ${
            projectId ? "project" : "organization"
          }.`
        });
      }

      try {
        let manifestResponse: TGitHubAppManifestResponse;
        try {
          const apiBaseUrl = await getGitHubInstanceApiUrl({
            credentials: { host: githubHost || undefined, instanceType }
          });

          const requestConfig: AxiosRequestConfig & { url: string } = {
            url: `https://${apiBaseUrl}/app-manifests/${encodeURIComponent(code)}/conversions`,
            method: "POST",
            data: {},
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28"
            }
          };

          const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId, gatewayPoolId });

          const { data } = effectiveGatewayId
            ? await requestWithGitHubGateway<TGitHubAppManifestResponse>(
                { gatewayId: effectiveGatewayId },
                gatewayV2Service,
                requestConfig,
                await getGitHubGatewayConnectionDetails(effectiveGatewayId, apiBaseUrl, gatewayV2Service)
              )
            : await safeRequest.request<TGitHubAppManifestResponse>(requestConfig);
          manifestResponse = data;
        } catch (err) {
          logger.error(
            {
              ...sanitizeGitHubAxiosError(err),
              orgId,
              projectId,
              instanceType,
              host: githubHost || "github.com",
              gatewayId,
              gatewayPoolId
            },
            `Failed to exchange GitHub App manifest code [orgId=${orgId}] [projectId=${
              projectId ?? "null"
            }] [instanceType=${instanceType}] [host=${githubHost || "github.com"}] [gatewayId=${
              gatewayId ?? "null"
            }] [gatewayPoolId=${gatewayPoolId ?? "null"}]`
          );
          throw new BadRequestError({
            message:
              "Failed to exchange GitHub App manifest code. The code may be expired or invalid. Please try registering the GitHub App again."
          });
        }
        codeExchanged = true;

        const { encryptor } = await kmsCoreDomain.createCipherPairWithDataKey(
          projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
        );

        const owner = manifestResponse.owner?.login ?? (githubOrg || null);

        try {
          created = await gitHubAppDAL.create({
            orgId,
            projectId,
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
              message: `A GitHub App with name "${name}" already exists in this ${
                projectId ? "project" : "organization"
              }. Note: a duplicate app was still created on GitHub (${manifestResponse.html_url}) — please delete it from your GitHub app settings.`
            });
          }
          throw err;
        }
      } finally {
        await keyStore.deleteItem(nameLockKey).catch(() => {});
      }
    } catch (err) {
      if (!codeExchanged) {
        await keyStore.deleteItem(stateClaimKey).catch(() => {});
      }
      throw err;
    }

    try {
      const actorUser = actorType === ActorType.USER ? await userDAL.findById(actorId) : null;
      await auditLogService.createAuditLog({
        ...auditLogInfo,
        orgId,
        ...(projectId ? { projectId } : {}),
        actor: actorUser
          ? {
              type: ActorType.USER,
              metadata: {
                userId: actorUser.id,
                email: actorUser.email,
                username: actorUser.username,
                ...(authMethod ? { authMethod } : {})
              }
            }
          : {
              type: ActorType.UNKNOWN_USER,
              metadata: {}
            },
        event: {
          type: EventType.CREATE_GITHUB_APP,
          metadata: {
            gitHubAppId: created.id,
            name: created.name,
            appId: created.appId,
            slug: created.slug,
            owner: created.owner,
            host: created.host,
            instanceType,
            projectId
          }
        }
      });
    } catch (err) {
      logger.error(
        { err, orgId, gitHubAppId: created.id },
        `Failed to write audit log for GitHub App manifest creation [orgId=${orgId}] [gitHubAppId=${created.id}]`
      );
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

  return {
    initiateManifestCreation,
    handleManifestCallback,
    listGitHubApps,
    deleteGitHubApp
  };
};
