import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { TAuth0ClientSecretRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/auth0-client-secret-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TAuth0ClientSecretRotationGeneratedCredentialsResponse;
};

export const ViewAuth0ClientSecretRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <>
      <ViewRotationGeneratedCredentialsDisplay
        activeCredentials={
          <>
            <CredentialDisplay label="Client ID">{activeCredentials?.clientId}</CredentialDisplay>
            <CredentialDisplay isSensitive label="Client Secret">
              {activeCredentials?.clientSecret}
            </CredentialDisplay>
          </>
        }
        inactiveCredentials={
          <>
            <CredentialDisplay label="Client ID">{inactiveCredentials?.clientId}</CredentialDisplay>
            <CredentialDisplay isSensitive label="Client Secret">
              {inactiveCredentials?.clientSecret}
            </CredentialDisplay>
          </>
        }
      />
      <NoticeBannerV2 title="Auth0 Retired Credentials Behavior">
        <p className="text-sm text-mineshaft-300">
          Due to how Auth0 client secrets are rotated, retired credentials will not be able to
          authenticate with Auth0 during their{" "}
          <a
            target="_blank"
            href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
            rel="noopener noreferrer"
            className="underline decoration-primary underline-offset-2 hover:text-mineshaft-200"
          >
            inactive period
          </a>
          . This is a limitation of the Auth0 platform and cannot be rectified by Infisical.
        </p>
      </NoticeBannerV2>
    </>
  );
};
