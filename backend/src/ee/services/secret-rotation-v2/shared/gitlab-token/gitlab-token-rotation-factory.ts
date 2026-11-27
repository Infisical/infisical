import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials,
  TSecretRotationV2Raw
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { deepEqual } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getGitLabConnectionRequestAuth } from "@app/services/app-connection/gitlab/gitlab-connection-fns";
import { TGitLabConnection, TGitLabRequestAuth } from "@app/services/app-connection/gitlab/gitlab-connection-types";

import {
  assertGitLabConnectionCanCreateTokens,
  createGitLabToken,
  revokeGitLabToken,
  rotateGitLabToken,
  verifyGitLabToken
} from "./gitlab-token-rotation-fns";
import { TGitLabTokenCredentials, TGitLabTokenSettings } from "./gitlab-token-rotation-types";

type TGitLabTokenRotationCredentials = TGitLabTokenCredentials[];

/**
 * The rotation flow shared by GitLab token rotations: create a token, save it, rotate it in place while its
 * settings stay the same, and revoke tokens by the id the rotation tracks. Each rotation supplies the token
 * collection and the token's settings.
 */
export const gitLabTokenRotationFactory = ({
  connection,
  rotationInterval,
  secretsMapping,
  appConnectionDAL,
  kmsDataKeyService,
  instanceConfigService,
  tokensPath,
  resourceLabel,
  permissionHint,
  token: { name, description, scopes, accessLevel },
  assertCanCreateToken
}: {
  connection: TGitLabConnection;
  rotationInterval: number;
  secretsMapping: { tokenId: string; token: string };
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  /** a GitLab token collection, e.g. `/groups/:id/access_tokens` */
  tokensPath: string;
  /** what the tokens belong to, for error messages, e.g. `group '34'` */
  resourceLabel: string;
  /** what to check when GitLab refuses for lack of permission */
  permissionHint: string;
  token: {
    name: string;
    description?: string;
    scopes: string[];
    accessLevel?: number;
  };
  /** runs before every token is created, and before the inactive token is revoked */
  assertCanCreateToken?: (auth: TGitLabRequestAuth) => Promise<void>;
}) => {
  const $getAuth = () => {
    assertGitLabConnectionCanCreateTokens(connection);
    return getGitLabConnectionRequestAuth({
      appConnection: connection,
      appConnectionDAL,
      kmsDataKeyService,
      instanceConfigService
    });
  };

  const $getTokenCreationAuth = async () => {
    const auth = await $getAuth();
    await assertCanCreateToken?.(auth);
    return auth;
  };

  const tokenSettings: TGitLabTokenSettings = {
    name,
    scopes: [...scopes].sort(),
    ...(description ? { description } : {}),
    ...(accessLevel ? { accessLevel } : {})
  };

  const $createToken = async (auth: TGitLabRequestAuth): Promise<TGitLabTokenCredentials> => ({
    ...(await createGitLabToken({
      auth,
      tokensPath,
      name,
      description,
      scopes,
      accessLevel,
      rotationInterval,
      resourceLabel,
      permissionHint
    })),
    settings: tokenSettings
  });

  // A token Infisical fails to save is one nothing tracks, so a retry or a delete can never revoke it.
  const $saveOrRevoke = async (
    auth: TGitLabRequestAuth,
    credentials: TGitLabTokenCredentials,
    save: (credentials: TGitLabTokenCredentials) => Promise<TSecretRotationV2Raw>
  ) => {
    try {
      return await save(credentials);
    } catch (error: unknown) {
      try {
        await revokeGitLabToken({
          auth,
          tokensPath,
          tokenId: credentials.tokenId,
          token: credentials.token,
          resourceLabel,
          permissionHint
        });
      } catch (revokeError: unknown) {
        logger.error(
          revokeError,
          `Failed to revoke an unsaved GitLab token [tokenId=${credentials.tokenId}] of ${resourceLabel}`
        );
      }

      throw error;
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TGitLabTokenRotationCredentials> = async (callback) => {
    const auth = await $getTokenCreationAuth();
    const credentials = await $createToken(auth);

    return $saveOrRevoke(auth, credentials, callback);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TGitLabTokenRotationCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const auth = await $getAuth();
    await Promise.all(
      generatedCredentials.map(({ tokenId, token }) =>
        revokeGitLabToken({ auth, tokensPath, tokenId, token, resourceLabel, permissionHint })
      )
    );

    return callback();
  };

  // While the inactive token's settings match the rotation's, it is rotated in place so it keeps its user
  // (a group access token's bot user). Otherwise it is revoked before the new token is created: the callback
  // overwrites the inactive slot, so revoking afterwards would lose its id if the revoke failed. A failed
  // create leaves a revoked token in the inactive slot, and the retry's revoke gets a 404, which counts as done.
  const rotateCredentials: TRotationFactoryRotateCredentials<TGitLabTokenRotationCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const auth = await $getTokenCreationAuth();

    if (credentialsToRevoke?.tokenId && deepEqual(credentialsToRevoke.settings, tokenSettings)) {
      const rotatedCredentials = await rotateGitLabToken({
        auth,
        tokensPath,
        tokenId: credentialsToRevoke.tokenId,
        rotationInterval,
        resourceLabel,
        permissionHint
      });

      if (rotatedCredentials) {
        return $saveOrRevoke(auth, { ...rotatedCredentials, settings: tokenSettings }, callback);
      }
    } else if (credentialsToRevoke?.tokenId) {
      await revokeGitLabToken({
        auth,
        tokensPath,
        tokenId: credentialsToRevoke.tokenId,
        token: credentialsToRevoke.token,
        resourceLabel,
        permissionHint
      });
    }

    const newCredentials = await $createToken(auth);

    return $saveOrRevoke(auth, newCredentials, callback);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TGitLabTokenRotationCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.tokenId, value: generatedCredentials.tokenId },
    { key: secretsMapping.token, value: generatedCredentials.token }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<TGitLabTokenRotationCredentials> = async (
    activeCredentials
  ) => {
    await verifyGitLabToken({
      instanceUrl: connection.credentials.instanceUrl,
      token: activeCredentials.token
    });
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
