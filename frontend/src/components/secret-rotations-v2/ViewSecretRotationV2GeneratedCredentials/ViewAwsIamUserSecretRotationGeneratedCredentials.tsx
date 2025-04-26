import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TAwsIamUserSecretRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/aws-iam-user-secret-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TAwsIamUserSecretRotationGeneratedCredentialsResponse;
};

export const ViewAwsIamUserSecretRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Access Key ID">
            {activeCredentials?.accessKeyId}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Secret Access Key">
            {activeCredentials?.secretAccessKey}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Access Key ID">
            {inactiveCredentials?.accessKeyId}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Secret Access Key">
            {inactiveCredentials?.secretAccessKey}
          </CredentialDisplay>
        </>
      }
    />
  );
};
