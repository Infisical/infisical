import { TRotationFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { gitLabTokenRotationFactory } from "@app/ee/services/secret-rotation-v2/shared/gitlab-token/gitlab-token-rotation-factory";
import { BadRequestError } from "@app/lib/errors";
import {
  getGitLabCurrentUserId,
  getGitLabErrorMessage
} from "@app/services/app-connection/gitlab/gitlab-connection-fns";

import {
  TGitLabServiceAccountTokenRotationGeneratedCredentials,
  TGitLabServiceAccountTokenRotationWithConnection
} from "./gitlab-service-account-token-rotation-types";

export const gitLabServiceAccountTokenRotationFactory: TRotationFactory<
  TGitLabServiceAccountTokenRotationWithConnection,
  TGitLabServiceAccountTokenRotationGeneratedCredentials
> = (
  secretRotation,
  appConnectionDAL,
  kmsDataKeyService,
  _gatewayV2Service,
  _gatewayPoolService,
  _keyStore,
  instanceConfigService
) => {
  const {
    connection,
    rotationInterval,
    parameters: { groupId, serviceAccountId, name, description, scopes },
    secretsMapping
  } = secretRotation;

  const resourceLabel = `service account '${serviceAccountId}' in group '${groupId}'`;

  return gitLabTokenRotationFactory({
    connection,
    rotationInterval,
    secretsMapping,
    appConnectionDAL,
    kmsDataKeyService,
    instanceConfigService,
    tokensPath: `/groups/${encodeURIComponent(groupId)}/service_accounts/${encodeURIComponent(serviceAccountId)}/personal_access_tokens`,
    resourceLabel,
    permissionHint: "Check that the connection's user has the Owner role on the group.",
    token: { name, description, scopes },
    // A token for the connection's own identity would give whoever reads the rotated secret the
    // connection's access (Owner on the group), outliving their access to Infisical.
    assertCanCreateToken: async (context) => {
      let connectionUserId: string;
      try {
        connectionUserId = await getGitLabCurrentUserId(context);
      } catch (error: unknown) {
        throw new BadRequestError({
          message: `Failed to look up the GitLab user of the connection: ${getGitLabErrorMessage(error)}`
        });
      }

      if (connectionUserId === serviceAccountId) {
        throw new BadRequestError({
          message: `The GitLab connection authenticates as ${resourceLabel}, so this rotation can't create tokens for it. Use a connection whose token belongs to a different GitLab user.`
        });
      }
    }
  });
};
