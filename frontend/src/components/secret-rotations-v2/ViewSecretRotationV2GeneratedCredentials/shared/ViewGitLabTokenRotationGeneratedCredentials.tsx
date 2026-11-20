import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { ViewRotationGeneratedCredentialsDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/ViewRotationGeneratedCredentialsDisplay";
import { TGitLabGroupAccessTokenRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/gitlab-group-access-token-rotation";
import { TGitLabServiceAccountTokenRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";

type Props = {
  generatedCredentialsResponse:
    | TGitLabServiceAccountTokenRotationGeneratedCredentialsResponse
    | TGitLabGroupAccessTokenRotationGeneratedCredentialsResponse;
};

export const ViewGitLabTokenRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Token ID">{activeCredentials?.tokenId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Token">
            {activeCredentials?.token}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Token ID">{inactiveCredentials?.tokenId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Token">
            {inactiveCredentials?.token}
          </CredentialDisplay>
        </>
      }
    />
  );
};
