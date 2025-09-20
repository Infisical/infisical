import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";
import { TRedisCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/redis-credentials-rotation";

type Props = {
  generatedCredentialsResponse: TRedisCredentialsRotationGeneratedCredentialsResponse;
};

export const ViewRedisCredentialsRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Username">{activeCredentials?.username}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {activeCredentials?.password}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Username">{inactiveCredentials?.username}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {inactiveCredentials?.password}
          </CredentialDisplay>
        </>
      }
    />
  );
};
