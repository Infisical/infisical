import { TAuth0ClientSecretRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/auth0-client-secret-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TAuth0ClientSecretRotationGeneratedCredentialsResponse;
};

export const ViewAuth0ClientSecretRotationGeneratedCredentials = ({
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
