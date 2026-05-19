import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TDatadogApplicationKeySecretRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/datadog-application-key-secret-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TDatadogApplicationKeySecretRotationGeneratedCredentialsResponse;
};

export const ViewDatadogApplicationKeySecretRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Application Key ID">
            {activeCredentials?.applicationKeyId}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Application Key">
            {activeCredentials?.applicationKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Application Key ID">
            {inactiveCredentials?.applicationKeyId}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Application Key">
            {inactiveCredentials?.applicationKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
