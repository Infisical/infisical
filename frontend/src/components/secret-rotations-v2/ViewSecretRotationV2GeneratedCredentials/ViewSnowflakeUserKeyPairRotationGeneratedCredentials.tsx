import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TSnowflakeUserKeyPairRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/snowflake-user-key-pair-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TSnowflakeUserKeyPairRotationGeneratedCredentialsResponse;
};

export const ViewSnowflakeUserKeyPairRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Public Key">{activeCredentials?.publicKey}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Private Key">
            {activeCredentials?.privateKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Public Key">{inactiveCredentials?.publicKey}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Private Key">
            {inactiveCredentials?.privateKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
