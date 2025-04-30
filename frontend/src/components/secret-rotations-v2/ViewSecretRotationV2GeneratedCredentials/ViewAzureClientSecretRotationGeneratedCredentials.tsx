import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TAzureClientSecretRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/azure-client-secret-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TAzureClientSecretRotationGeneratedCredentialsResponse;
};

export const ViewAzureClientSecretRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Client ID">{activeCredentials?.clientId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Client Secret">
            {activeCredentials?.clientSecret}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Client ID">{inactiveCredentials?.clientId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Client Secret">
            {inactiveCredentials?.clientSecret}
          </CredentialDisplay>
        </>
      }
    />
  );
};
