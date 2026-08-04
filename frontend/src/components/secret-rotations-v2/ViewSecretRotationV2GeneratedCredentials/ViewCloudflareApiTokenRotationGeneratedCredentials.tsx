import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TCloudflareApiTokenRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/cloudflare-api-token-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TCloudflareApiTokenRotationGeneratedCredentialsResponse;
};

export const ViewCloudflareApiTokenRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Token ID">{activeCredentials?.tokenId}</CredentialDisplay>
          <CredentialDisplay isSensitive label="API Token">
            {activeCredentials?.apiToken}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        inactiveCredentials ? (
          <>
            <CredentialDisplay label="Token ID">{inactiveCredentials?.tokenId}</CredentialDisplay>
            <CredentialDisplay isSensitive label="API Token">
              {inactiveCredentials?.apiToken}
            </CredentialDisplay>
          </>
        ) : undefined
      }
    />
  );
};
