import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TStripeApiKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/stripe-api-key-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TStripeApiKeyRotationGeneratedCredentialsResponse;
};

export const ViewStripeApiKeyRotationGeneratedCredentials = ({
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
          <CredentialDisplay isSensitive label="API Key">
            {activeCredentials?.apiKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Key ID">{inactiveCredentials?.keyId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="API Key">
            {inactiveCredentials?.apiKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
