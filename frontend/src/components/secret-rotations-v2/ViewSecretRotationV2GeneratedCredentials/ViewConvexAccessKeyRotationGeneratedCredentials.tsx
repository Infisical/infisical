import { TConvexAccessKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/convex-access-key-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TConvexAccessKeyRotationGeneratedCredentialsResponse;
};

export const ViewConvexAccessKeyRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <CredentialDisplay isSensitive label="Access Key">
          {activeCredentials?.accessKey}
        </CredentialDisplay>
      }
      inactiveCredentials={
        <CredentialDisplay isSensitive label="Access Key">
          {inactiveCredentials?.accessKey}
        </CredentialDisplay>
      }
    />
  );
};
