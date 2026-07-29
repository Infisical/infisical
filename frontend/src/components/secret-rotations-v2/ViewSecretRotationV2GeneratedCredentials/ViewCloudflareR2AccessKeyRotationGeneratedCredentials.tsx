import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TCloudflareR2AccessKeyRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/cloudflare-r2-access-key-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TCloudflareR2AccessKeyRotationGeneratedCredentialsResponse;
};

export const ViewCloudflareR2AccessKeyRotationGeneratedCredentials = ({
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
          <CredentialDisplay isSensitive label="API Token">
            {activeCredentials?.apiToken}
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
          <CredentialDisplay isSensitive label="API Token">
            {inactiveCredentials?.apiToken}
          </CredentialDisplay>
        </>
      }
    />
  );
};
