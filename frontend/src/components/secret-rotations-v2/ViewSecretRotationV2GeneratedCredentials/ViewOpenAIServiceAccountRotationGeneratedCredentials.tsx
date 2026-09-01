import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TOpenAIServiceAccountRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/openai-service-account-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TOpenAIServiceAccountRotationGeneratedCredentialsResponse;
};

export const ViewOpenAIServiceAccountRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <CredentialDisplay isSensitive label="API Key">
          {activeCredentials?.apiKey}
        </CredentialDisplay>
      }
      inactiveCredentials={
        <CredentialDisplay isSensitive label="API Key">
          {inactiveCredentials?.apiKey}
        </CredentialDisplay>
      }
    />
  );
};
