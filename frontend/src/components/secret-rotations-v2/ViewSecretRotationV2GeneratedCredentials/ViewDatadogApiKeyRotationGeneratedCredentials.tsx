import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TDatadogApiKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/datadog-api-key-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TDatadogApiKeyRotationGeneratedCredentialsResponse;
};

export const ViewDatadogApiKeyRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="API Key ID">{activeCredentials?.apiKeyId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="API Key">
            {activeCredentials?.apiKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="API Key ID">{inactiveCredentials?.apiKeyId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="API Key">
            {inactiveCredentials?.apiKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
