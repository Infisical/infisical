import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import {
  assertGitLabConnectionCanCreateTokens,
  createGitLabToken,
  getGitLabTokenApiContext,
  revokeGitLabToken,
  verifyGitLabToken
} from "@app/ee/services/secret-rotation-v2/shared/gitlab-token";

import {
  TGitLabServiceAccountTokenRotationGeneratedCredentials,
  TGitLabServiceAccountTokenRotationWithConnection
} from "./gitlab-service-account-token-rotation-types";

export const gitLabServiceAccountTokenRotationFactory: TRotationFactory<
  TGitLabServiceAccountTokenRotationWithConnection,
  TGitLabServiceAccountTokenRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsDataKeyService) => {
  const {
    connection,
    rotationInterval,
    parameters: { groupId, serviceAccountId, name, description, scopes },
    secretsMapping
  } = secretRotation;

  const tokensPath = `/groups/${encodeURIComponent(groupId)}/service_accounts/${encodeURIComponent(serviceAccountId)}/personal_access_tokens`;
  const resourceLabel = `service account '${serviceAccountId}' in group '${groupId}'`;

  const $getContext = () => {
    assertGitLabConnectionCanCreateTokens(connection);
    return getGitLabTokenApiContext({ connection, appConnectionDAL, kmsDataKeyService });
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TGitLabServiceAccountTokenRotationGeneratedCredentials
  > = async (callback) => {
    const context = await $getContext();
    const credentials = await createGitLabToken({
      context,
      tokensPath,
      name,
      description,
      scopes,
      rotationInterval,
      resourceLabel
    });

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TGitLabServiceAccountTokenRotationGeneratedCredentials
  > = async (generatedCredentials, callback) => {
    if (!generatedCredentials?.length) return callback();

    const context = await $getContext();
    await Promise.all(
      generatedCredentials.map(({ tokenId }) => revokeGitLabToken({ context, tokensPath, tokenId, resourceLabel }))
    );

    return callback();
  };

  // The inactive token is revoked before the new one is created: the callback overwrites the inactive
  // slot, so revoking afterwards would lose its id if the revoke failed. A failed create leaves a revoked
  // token in the inactive slot, and the retry's revoke gets a 404, which counts as done.
  const rotateCredentials: TRotationFactoryRotateCredentials<
    TGitLabServiceAccountTokenRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    const context = await $getContext();

    if (credentialsToRevoke?.tokenId) {
      await revokeGitLabToken({ context, tokensPath, tokenId: credentialsToRevoke.tokenId, resourceLabel });
    }

    const newCredentials = await createGitLabToken({
      context,
      tokensPath,
      name,
      description,
      scopes,
      rotationInterval,
      resourceLabel
    });

    return callback(newCredentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TGitLabServiceAccountTokenRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.tokenId, value: generatedCredentials.tokenId },
    { key: secretsMapping.token, value: generatedCredentials.token }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TGitLabServiceAccountTokenRotationGeneratedCredentials
  > = async (activeCredentials) => {
    await verifyGitLabToken({ instanceUrl: connection.credentials.instanceUrl, token: activeCredentials.token });
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
