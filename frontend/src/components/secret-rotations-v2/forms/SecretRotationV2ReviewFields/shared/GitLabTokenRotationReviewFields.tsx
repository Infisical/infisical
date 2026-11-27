import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { Badge } from "@app/components/v3";
import {
  useGitLabConnectionListGroups,
  useGitLabConnectionListGroupServiceAccounts
} from "@app/hooks/api/appConnections/gitlab";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { GITLAB_TOKEN_ACCESS_LEVEL_LABELS } from "@app/hooks/api/secretRotationsV2/types/gitlab-group-access-token-rotation";

import { SecretRotationReviewSection } from "./SecretRotationReviewSection";

// matches the parameters step, so the review reads the groups it already loaded
const GITLAB_GROUP_LIST_LIMIT = 20;

export const GitLabTokenRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.GitLabServiceAccountToken | SecretRotation.GitLabGroupAccessToken;
    }
  >();

  const [type, connectionId, parameters, { tokenId, token }] = watch([
    "type",
    "connection.id",
    "parameters",
    "secretsMapping"
  ]);

  const serviceAccountId =
    "serviceAccountId" in parameters ? parameters.serviceAccountId : undefined;
  const accessLevel = "accessLevel" in parameters ? parameters.accessLevel : undefined;

  const { data: groups } = useGitLabConnectionListGroups(
    connectionId,
    undefined,
    GITLAB_GROUP_LIST_LIMIT,
    {
      enabled: Boolean(connectionId)
    }
  );
  const { data: serviceAccounts } = useGitLabConnectionListGroupServiceAccounts(
    connectionId,
    parameters.groupId,
    {
      enabled: Boolean(
        type === SecretRotation.GitLabServiceAccountToken && connectionId && parameters.groupId
      )
    }
  );

  const group = groups?.find(({ id }) => id === parameters.groupId);
  const serviceAccount = serviceAccounts?.find(({ id }) => id === serviceAccountId);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Group">{group?.fullPath ?? parameters.groupId}</ReviewField>
        {serviceAccountId && (
          <ReviewField label="Service Account">
            {serviceAccount
              ? `${serviceAccount.name} (@${serviceAccount.username})`
              : serviceAccountId}
          </ReviewField>
        )}
        <ReviewField label="Token Name">{parameters.name}</ReviewField>
        {parameters.description && (
          <ReviewField label="Token Description">{parameters.description}</ReviewField>
        )}
        <ReviewField label="Scopes">
          <div className="flex flex-wrap gap-1">
            {parameters.scopes.map((scope) => (
              <Badge key={scope} variant="neutral">
                {scope}
              </Badge>
            ))}
          </div>
        </ReviewField>
        {accessLevel && (
          <ReviewField label="Role">{GITLAB_TOKEN_ACCESS_LEVEL_LABELS[accessLevel]}</ReviewField>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Token ID">{tokenId}</ReviewField>
        <ReviewField label="Token">{token}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
