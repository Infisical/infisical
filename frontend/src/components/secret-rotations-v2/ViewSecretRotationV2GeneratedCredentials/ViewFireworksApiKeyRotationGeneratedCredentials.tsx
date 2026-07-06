import { TFireworksApiKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/fireworks-api-key-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TFireworksApiKeyRotationGeneratedCredentialsResponse;
};

export const ViewFireworksApiKeyRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <CredentialDisplay isSensitive label="Secret Value">
          {activeCredentials?.secretValue}
        </CredentialDisplay>
      }
      inactiveCredentials={
        <CredentialDisplay isSensitive label="Secret Value">
          {inactiveCredentials?.secretValue}
        </CredentialDisplay>
      }
    />
  );
};
