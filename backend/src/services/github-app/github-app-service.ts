import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TGitHubAppDALFactory } from "./github-app-dal";
import {
  TDeleteGitHubAppDTO,
  TExchangeGitHubManifestCodeDTO,
  TGitHubAppManifestResponse,
  TGitHubManifestStatePayload,
  TInitiateGitHubManifestDTO,
  TListGitHubAppsDTO,
  TRegisterGitHubAppDTO,
  TSanitizedGitHubApp
} from "./github-app-types";

type TGitHubAppServiceFactoryDep = {
  gitHubAppDAL: TGitHubAppDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TGitHubAppServiceFactory = ReturnType<typeof gitHubAppServiceFactory>;

export const gitHubAppServiceFactory = ({
  gitHubAppDAL,
  permissionService,
  kmsService
}: TGitHubAppServiceFactoryDep) => {
  const exchangeManifestCode = async ({
    name,
    code,
    orgPermission
  }: TExchangeGitHubManifestCodeDTO): Promise<TSanitizedGitHubApp> => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const existing = await gitHubAppDAL.findOne({ orgId: orgPermission.orgId, name });
    if (existing) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" already exists in this organization.`
      });
    }

    let manifestResponse: TGitHubAppManifestResponse;
    try {
      const { data } = await request.post<TGitHubAppManifestResponse>(
        `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
        {},
        {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
          }
        }
      );
      manifestResponse = data;
    } catch (err) {
      throw new BadRequestError({
        message:
          "Failed to exchange GitHub App manifest code. The code may be expired or invalid. Please try registering the GitHub App again."
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    const created = await gitHubAppDAL.create({
      orgId: orgPermission.orgId,
      name,
      encryptedAppId: encryptor({ plainText: Buffer.from(String(manifestResponse.id)) }).cipherTextBlob,
      encryptedClientId: encryptor({ plainText: Buffer.from(manifestResponse.client_id) }).cipherTextBlob,
      encryptedClientSecret: encryptor({ plainText: Buffer.from(manifestResponse.client_secret) }).cipherTextBlob,
      encryptedPrivateKey: encryptor({ plainText: Buffer.from(manifestResponse.pem) }).cipherTextBlob,
      encryptedSlug: encryptor({ plainText: Buffer.from(manifestResponse.slug) }).cipherTextBlob
    });

    return {
      id: created.id,
      orgId: created.orgId,
      name: created.name,
      appId: String(manifestResponse.id),
      slug: manifestResponse.slug,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };
  };

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

    const dbApps: TSanitizedGitHubApp[] = [];
    if (apps.length > 0) {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: orgPermission.orgId
      });

      for (const app of apps) {
        dbApps.push({
          id: app.id,
          orgId: app.orgId,
          name: app.name,
          appId: decryptor({ cipherTextBlob: app.encryptedAppId }).toString(),
          slug: decryptor({ cipherTextBlob: app.encryptedSlug }).toString(),
          createdAt: app.createdAt,
          updatedAt: app.updatedAt
        });
      }
    }

    const { INF_APP_CONNECTION_GITHUB_APP_ID, INF_APP_CONNECTION_GITHUB_APP_SLUG } = getConfig();

    const sharedApp: TSanitizedGitHubApp | null =
      INF_APP_CONNECTION_GITHUB_APP_ID && INF_APP_CONNECTION_GITHUB_APP_SLUG
        ? {
            id: null,
            orgId: orgPermission.orgId,
            name: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            appId: INF_APP_CONNECTION_GITHUB_APP_ID,
            slug: INF_APP_CONNECTION_GITHUB_APP_SLUG,
            createdAt: null,
            updatedAt: null
          }
        : null;

    return sharedApp ? [sharedApp, ...dbApps] : dbApps;
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

    const existing = await gitHubAppDAL.findOne({ id, orgId: orgPermission.orgId });
    if (!existing) {
      throw new NotFoundError({ message: `GitHub App with id ${id} not found in this organization.` });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    const sanitized: TSanitizedGitHubApp = {
      id: existing.id,
      orgId: existing.orgId,
      name: existing.name,
      appId: decryptor({ cipherTextBlob: existing.encryptedAppId }).toString(),
      slug: decryptor({ cipherTextBlob: existing.encryptedSlug }).toString(),
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt
    };

    await gitHubAppDAL.deleteById(existing.id);

    return sanitized;
  };

  const registerGitHubApp = async ({
    name,
    appId,
    slug,
    clientId,
    clientSecret,
    privateKey,
    orgPermission
  }: TRegisterGitHubAppDTO): Promise<TSanitizedGitHubApp> => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const existing = await gitHubAppDAL.findOne({ orgId: orgPermission.orgId, name });
    if (existing) {
      throw new BadRequestError({
        message: `A GitHub App with name "${name}" already exists in this organization.`
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgPermission.orgId
    });

    const created = await gitHubAppDAL.create({
      orgId: orgPermission.orgId,
      name,
      encryptedAppId: encryptor({ plainText: Buffer.from(appId) }).cipherTextBlob,
      encryptedClientId: encryptor({ plainText: Buffer.from(clientId) }).cipherTextBlob,
      encryptedClientSecret: encryptor({ plainText: Buffer.from(clientSecret) }).cipherTextBlob,
      encryptedPrivateKey: encryptor({ plainText: Buffer.from(privateKey) }).cipherTextBlob,
      encryptedSlug: encryptor({ plainText: Buffer.from(slug) }).cipherTextBlob
    });

    return {
      id: created.id,
      orgId: created.orgId,
      name: created.name,
      appId,
      slug,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };
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

    const { orgId, actorId, actorType, authMethod, name, instanceType, githubHost, installState } = statePayload;

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

    if (githubHost) {
      await blockLocalAndPrivateIpAddresses(`https://${githubHost}`);
    }

    let manifestResponse: TGitHubAppManifestResponse;
    try {
      const resolvedApiHost = githubHost ? `https://${githubHost}/api/v3` : "https://api.github.com";
      const { data } = await request.post<TGitHubAppManifestResponse>(
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

    let created: Awaited<ReturnType<typeof gitHubAppDAL.create>>;
    try {
      created = await gitHubAppDAL.create({
        orgId,
        name,
        encryptedAppId: encryptor({ plainText: Buffer.from(String(manifestResponse.id)) }).cipherTextBlob,
        encryptedClientId: encryptor({ plainText: Buffer.from(manifestResponse.client_id) }).cipherTextBlob,
        encryptedClientSecret: encryptor({ plainText: Buffer.from(manifestResponse.client_secret) }).cipherTextBlob,
        encryptedPrivateKey: encryptor({ plainText: Buffer.from(manifestResponse.pem) }).cipherTextBlob,
        encryptedSlug: encryptor({ plainText: Buffer.from(manifestResponse.slug) }).cipherTextBlob
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

  return {
    exchangeManifestCode,
    initiateManifestCreation,
    handleManifestCallback,
    listGitHubApps,
    deleteGitHubApp,
    registerGitHubApp
  };
};
