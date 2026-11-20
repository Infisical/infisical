import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials,
  TSecretRotationV2Raw
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TGitLabConnection } from "@app/services/app-connection/gitlab/gitlab-connection-types";

import {
  assertGitLabConnectionCanCreateTokens,
  createGitLabToken,
  getGitLabTokenApiContext,
  revokeGitLabToken,
  verifyGitLabToken
} from "./gitlab-token-rotation-fns";
import { TGitLabTokenApiContext, TGitLabTokenCredentials } from "./gitlab-token-rotation-types";

type TGitLabTokenRotationCredentials = TGitLabTokenCredentials[];

/**
 * The rotation flow shared by GitLab token rotations: create a token, save it, and revoke tokens by the id
 * the rotation tracks. Each rotation supplies the token collection and the token's settings.
 */
export const gitLabTokenRotationFactory = ({
  connection,
  rotationInterval,
  secretsMapping,
  appConnectionDAL,
  kmsDataKeyService,
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
  assertCanCreateToken?: (context: TGitLabTokenApiContext) => Promise<void>;
}) => {
  const $getContext = () => {
    assertGitLabConnectionCanCreateTokens(connection);
    return getGitLabTokenApiContext({
      connection,
      appConnectionDAL,
      kmsDataKeyService
    });
  };

  const $getTokenCreationContext = async () => {
    const context = await $getContext();
    await assertCanCreateToken?.(context);
    return context;
  };

  const $createToken = (context: TGitLabTokenApiContext) =>
    createGitLabToken({
      context,
      tokensPath,
      name,
      description,
      scopes,
      accessLevel,
      rotationInterval,
      resourceLabel,
      permissionHint
    });

  // A token Infisical fails to save is one nothing tracks, so a retry or a delete can never revoke it.
  const $saveOrRevoke = async (
    context: TGitLabTokenApiContext,
    credentials: TGitLabTokenCredentials,
    save: (credentials: TGitLabTokenCredentials) => Promise<TSecretRotationV2Raw>
  ) => {
    try {
      return await save(credentials);
    } catch (error: unknown) {
      try {
        await revokeGitLabToken({
          context,
          tokensPath,
          tokenId: credentials.tokenId,
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
    const context = await $getTokenCreationContext();
    const credentials = await $createToken(context);

    return $saveOrRevoke(context, credentials, callback);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TGitLabTokenRotationCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const context = await $getContext();
    await Promise.all(
      generatedCredentials.map(({ tokenId }) =>
        revokeGitLabToken({ context, tokensPath, tokenId, resourceLabel, permissionHint })
      )
    );

    return callback();
  };

  // The inactive token is revoked before the new one is created: the callback overwrites the inactive
  // slot, so revoking afterwards would lose its id if the revoke failed. A failed create leaves a revoked
  // token in the inactive slot, and the retry's revoke gets a 404, which counts as done.
  const rotateCredentials: TRotationFactoryRotateCredentials<TGitLabTokenRotationCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const context = await $getTokenCreationContext();

    if (credentialsToRevoke?.tokenId) {
      await revokeGitLabToken({
        context,
        tokensPath,
        tokenId: credentialsToRevoke.tokenId,
        resourceLabel,
        permissionHint
      });
    }

    const newCredentials = await $createToken(context);

    return $saveOrRevoke(context, newCredentials, callback);
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
