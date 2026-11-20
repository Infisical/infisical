import { TRotationFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { gitLabTokenRotationFactory } from "@app/ee/services/secret-rotation-v2/shared/gitlab-token/gitlab-token-rotation-factory";

import {
  TGitLabGroupAccessTokenRotationGeneratedCredentials,
  TGitLabGroupAccessTokenRotationWithConnection
} from "./gitlab-group-access-token-rotation-types";

// Every group access token gets its own bot user, so unlike a service account token it can never be a
// token for the connection's own identity.
export const gitLabGroupAccessTokenRotationFactory: TRotationFactory<
  TGitLabGroupAccessTokenRotationWithConnection,
  TGitLabGroupAccessTokenRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsDataKeyService) => {
  const {
    connection,
    rotationInterval,
    parameters: { groupId, name, description, scopes, accessLevel },
    secretsMapping
  } = secretRotation;

  return gitLabTokenRotationFactory({
    connection,
    rotationInterval,
    secretsMapping,
    appConnectionDAL,
    kmsDataKeyService,
    tokensPath: `/groups/${encodeURIComponent(groupId)}/access_tokens`,
    resourceLabel: `group '${groupId}'`,
    permissionHint:
      "Check that the connection's user has the Owner role on the group, that group access token creation is allowed in the group's Settings > General > Permissions and group features, and, on GitLab.com, that the group is on a Premium or Ultimate plan (group access tokens aren't available on Free or during a trial).",
    token: { name, description, scopes, accessLevel }
  });
};
