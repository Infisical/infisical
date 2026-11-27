import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TDynamicSecretUserCredentials } from "@app/db/schemas";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { TDynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders, OAuth2GrantType } from "@app/ee/services/dynamic-secret/providers/models";
import {
  parseOAuth2Inputs,
  resolveOAuth2TokenExpiresAt,
  revokeOAuth2Token
} from "@app/ee/services/dynamic-secret/providers/oauth2";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretUserCredentialDALFactory } from "./dynamic-secret-user-credential-dal";
import {
  DynamicSecretUserCredentialStatus,
  TDeleteDynamicSecretUserCredentialDTO,
  TDynamicSecretUserCredentialSecrets,
  TGetDynamicSecretUserCredentialDTO,
  TIssuedUserAccessToken,
  TIssueUserAccessTokenDTO,
  TListDynamicSecretUserCredentialsDTO,
  TUpsertDynamicSecretUserCredentialDTO,
  USER_REAUTHORIZATION_REQUIRED_ERROR_NAME
} from "./dynamic-secret-user-credential-types";

// Must outlast the 30s token request, or a second refresh could start while the first is still in flight.
const REFRESH_LOCK_DURATION_MS = 60_000;
// Waits up to ~35s for a refresh another request is running, then uses the tokens it stored.
const REFRESH_LOCK_SETTINGS = { retryCount: 70, retryDelay: 500 };

type TDynamicSecretUserCredentialServiceFactoryDep = {
  dynamicSecretUserCredentialDAL: TDynamicSecretUserCredentialDALFactory;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findOne">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseService, "getPlan">;
  kmsDataKeyService: Pick<TKmsDataKeyService, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

export type TDynamicSecretUserCredentialServiceFactory = ReturnType<typeof dynamicSecretUserCredentialServiceFactory>;

export const dynamicSecretUserCredentialServiceFactory = ({
  dynamicSecretUserCredentialDAL,
  dynamicSecretDAL,
  folderDAL,
  projectDAL,
  permissionService,
  licenseService,
  kmsDataKeyService,
  keyStore
}: TDynamicSecretUserCredentialServiceFactoryDep) => {
  const $getCipherPair = (projectId: string) =>
    kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const $decryptSecrets = (
    decryptor: Awaited<ReturnType<typeof $getCipherPair>>["decryptor"],
    userCredential: TDynamicSecretUserCredentials
  ) =>
    JSON.parse(
      decryptor({ cipherTextBlob: userCredential.encryptedCredentials }).toString()
    ) as TDynamicSecretUserCredentialSecrets;

  const $resolveDynamicSecret = async ({
    projectSlug,
    environmentSlug,
    path,
    name,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TGetDynamicSecretUserCredentialDTO | TListDynamicSecretUserCredentialsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(project.id, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecret = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecret)
      throw new NotFoundError({
        message: `Dynamic secret with name '${name}' in folder with path '${path}' not found`
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.ManageUserCredentials,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecret.metadata
      })
    );

    const cipherPair = await $getCipherPair(project.id);

    const notForUsers = new BadRequestError({
      message: `Dynamic secret '${name}' doesn't issue tokens for users. User tokens can only be stored on an OAuth 2.0 dynamic secret that uses the authorization code grant.`
    });
    if (dynamicSecret.type !== DynamicSecretProviders.OAuth2) throw notForUsers;

    const providerInputs = await parseOAuth2Inputs(
      JSON.parse(cipherPair.decryptor({ cipherTextBlob: dynamicSecret.encryptedInput }).toString()) as unknown
    );
    if (providerInputs.grantType !== OAuth2GrantType.AuthorizationCode) throw notForUsers;

    return {
      projectId: project.id,
      dynamicSecret,
      providerInputs,
      ...cipherPair,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const $findUserCredentialOrThrow = async (dynamicSecret: { id: string; name: string }, externalUserId: string) => {
    const userCredential = await dynamicSecretUserCredentialDAL.findByExternalUserId(dynamicSecret.id, externalUserId);
    if (!userCredential) {
      throw new NotFoundError({
        message: `No tokens are stored for user '${externalUserId}' on dynamic secret '${dynamicSecret.name}'.`
      });
    }
    return userCredential;
  };

  const upsertUserCredential = async ({
    externalUserId,
    accessToken,
    refreshToken,
    expiresInSeconds,
    tokenType,
    scope,
    ...location
  }: TUpsertDynamicSecretUserCredentialDTO) => {
    const { dynamicSecret, encryptor, ...resolved } = await $resolveDynamicSecret({ ...location, externalUserId });

    const plan = await licenseService.getPlan(location.actorOrgId);
    plan.assert(PlanFeature.DynamicSecret);

    const secrets: TDynamicSecretUserCredentialSecrets = { accessToken, refreshToken, tokenType, scope };
    const expiresAt = resolveOAuth2TokenExpiresAt(accessToken, expiresInSeconds, Date.now());

    const userCredential = await dynamicSecretUserCredentialDAL.upsertCredentials({
      dynamicSecretId: dynamicSecret.id,
      externalUserId,
      encryptedCredentials: encryptor({ plainText: Buffer.from(JSON.stringify(secrets)) }).cipherTextBlob,
      accessTokenExpiresAt: expiresAt === null ? null : new Date(expiresAt)
    });

    return {
      userCredential,
      wasCreated: userCredential.version === 1,
      dynamicSecret,
      projectId: resolved.projectId,
      environment: resolved.environment,
      secretPath: resolved.secretPath
    };
  };

  const listUserCredentials = async ({ offset, limit, ...location }: TListDynamicSecretUserCredentialsDTO) => {
    const { dynamicSecret, projectId, environment, secretPath } = await $resolveDynamicSecret({
      ...location,
      offset,
      limit
    });

    const { userCredentials, totalCount } = await dynamicSecretUserCredentialDAL.listByDynamicSecretId(
      dynamicSecret.id,
      { offset, limit }
    );

    return { userCredentials, totalCount, dynamicSecret, projectId, environment, secretPath };
  };

  const getUserCredential = async (dto: TGetDynamicSecretUserCredentialDTO) => {
    const { dynamicSecret, projectId, environment, secretPath } = await $resolveDynamicSecret(dto);
    const userCredential = await $findUserCredentialOrThrow(dynamicSecret, dto.externalUserId);
    return { userCredential, dynamicSecret, projectId, environment, secretPath };
  };

  const deleteUserCredential = async (dto: TDeleteDynamicSecretUserCredentialDTO) => {
    const { dynamicSecret, providerInputs, decryptor, projectId, environment, secretPath } =
      await $resolveDynamicSecret(dto);
    const userCredential = await $findUserCredentialOrThrow(dynamicSecret, dto.externalUserId);

    // Best effort: the tokens leave Infisical either way, and a provider without RFC 7009 support must not
    // leave the application unable to remove them.
    let isRefreshTokenRevoked = false;
    try {
      const { refreshToken } = $decryptSecrets(decryptor, userCredential);
      await revokeOAuth2Token(providerInputs, refreshToken, "refresh_token");
      isRefreshTokenRevoked = true;
    } catch (error) {
      logger.warn(
        `Failed to revoke refresh token while deleting dynamic secret user credential [userCredentialId=${userCredential.id}] [dynamicSecretId=${dynamicSecret.id}]: ${(error as Error)?.message}`
      );
    }

    await dynamicSecretUserCredentialDAL.deleteById(userCredential.id);

    return { userCredential, isRefreshTokenRevoked, dynamicSecret, projectId, environment, secretPath };
  };

  const issueAccessToken = async ({
    dynamicSecret,
    projectId,
    externalUserId,
    leaseEndsAt,
    refresh
  }: TIssueUserAccessTokenDTO): Promise<TIssuedUserAccessToken> => {
    const { encryptor, decryptor } = await $getCipherPair(projectId);

    const reauthorizationRequired = (reason?: string | null) =>
      new BadRequestError({
        name: USER_REAUTHORIZATION_REQUIRED_ERROR_NAME,
        message: `The tokens stored for user '${externalUserId}' on dynamic secret '${dynamicSecret.name}' no longer work.${reason ? ` ${reason}` : ""} The user has to authorize your application again; store their new tokens, then create the lease.`,
        details: { externalUserId }
      });

    const load = async () => {
      const userCredential = await dynamicSecretUserCredentialDAL.findByExternalUserId(
        dynamicSecret.id,
        externalUserId
      );
      if (!userCredential) {
        throw new NotFoundError({
          message: `No tokens are stored for user '${externalUserId}' on dynamic secret '${dynamicSecret.name}'. Store the user's tokens before creating a lease for them.`
        });
      }
      if (userCredential.status === DynamicSecretUserCredentialStatus.ReauthorizationRequired) {
        throw reauthorizationRequired(userCredential.statusDetails);
      }
      return userCredential;
    };

    const coversLease = (userCredential: TDynamicSecretUserCredentials) =>
      Boolean(userCredential.accessTokenExpiresAt && userCredential.accessTokenExpiresAt.getTime() >= leaseEndsAt);

    const toIssued = (
      userCredential: TDynamicSecretUserCredentials,
      secrets: TDynamicSecretUserCredentialSecrets,
      requestedAt = Date.now()
    ): TIssuedUserAccessToken => ({
      accessToken: secrets.accessToken,
      tokenType: secrets.tokenType,
      scope: secrets.scope,
      requestedAt,
      expiresAt: userCredential.accessTokenExpiresAt?.getTime() ?? null
    });

    const issueStoredOrThrow = async (retryMessage: string) => {
      const userCredential = await load();
      if (coversLease(userCredential)) return toIssued(userCredential, $decryptSecrets(decryptor, userCredential));
      throw new BadRequestError({ message: retryMessage });
    };

    let current = await load();
    if (coversLease(current)) return toIssued(current, $decryptSecrets(decryptor, current));

    let lock: Awaited<ReturnType<TKeyStoreFactory["acquireLock"]>>;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.DynamicSecretUserCredentialRefreshLock(current.id)],
        REFRESH_LOCK_DURATION_MS,
        REFRESH_LOCK_SETTINGS
      );
    } catch {
      return issueStoredOrThrow(
        `Infisical is still refreshing the access token for user '${externalUserId}'. Try again in a few seconds.`
      );
    }

    try {
      current = await load();
      if (coversLease(current)) return toIssued(current, $decryptSecrets(decryptor, current));

      const secrets = $decryptSecrets(decryptor, current);
      const result = await refresh(secrets.refreshToken);
      const replacedDuringRefresh = `The tokens for user '${externalUserId}' were replaced while Infisical was refreshing them. Try again.`;

      if (result.status === "rejected") {
        const marked = await dynamicSecretUserCredentialDAL.updateIfVersion(current.id, current.version, {
          status: DynamicSecretUserCredentialStatus.ReauthorizationRequired,
          statusDetails: result.reason
        });
        // the application stored new tokens while this refresh was in flight, and those stand
        if (!marked) return await issueStoredOrThrow(replacedDuringRefresh);
        throw reauthorizationRequired(result.reason);
      }

      const nextSecrets: TDynamicSecretUserCredentialSecrets = {
        accessToken: result.accessToken,
        // RFC 6749 section 6: a server that issues no new refresh token keeps the old one valid
        refreshToken: result.refreshToken ?? secrets.refreshToken,
        tokenType: result.tokenType ?? secrets.tokenType,
        scope: result.scope ?? secrets.scope
      };

      let updated: TDynamicSecretUserCredentials | undefined;
      try {
        updated = await dynamicSecretUserCredentialDAL.updateIfVersion(current.id, current.version, {
          encryptedCredentials: encryptor({ plainText: Buffer.from(JSON.stringify(nextSecrets)) }).cipherTextBlob,
          accessTokenExpiresAt: result.expiresAt === null ? null : new Date(result.expiresAt),
          lastRefreshedAt: new Date(),
          status: DynamicSecretUserCredentialStatus.Active,
          statusDetails: null
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to store refreshed dynamic secret user tokens; if the server rotated the refresh token, the user has to authorize again [userCredentialId=${current.id}] [dynamicSecretId=${dynamicSecret.id}]`
        );
        throw error;
      }

      if (!updated) return await issueStoredOrThrow(replacedDuringRefresh);
      return toIssued(updated, nextSecrets, result.requestedAt);
    } finally {
      await lock.release().catch(() => {});
    }
  };

  return {
    upsertUserCredential,
    listUserCredentials,
    getUserCredential,
    deleteUserCredential,
    issueAccessToken
  };
};
