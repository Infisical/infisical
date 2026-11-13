import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TGcpServiceAccountKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/gcp-service-account-key-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TGcpServiceAccountKeyRotationGeneratedCredentialsResponse;
};

export const ViewGcpServiceAccountKeyRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Key ID">{activeCredentials?.keyId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Service Account Key">
            {activeCredentials?.serviceAccountKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Key ID">{inactiveCredentials?.keyId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Service Account Key">
            {inactiveCredentials?.serviceAccountKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
