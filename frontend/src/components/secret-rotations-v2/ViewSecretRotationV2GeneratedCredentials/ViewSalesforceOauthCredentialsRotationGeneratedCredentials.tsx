import { TSalesforceOauthCredentialsRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/salesforce-oauth-credentials-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TSalesforceOauthCredentialsRotationGeneratedCredentialsResponse;
};

export const ViewSalesforceOauthCredentialsRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay isSensitive label="Consumer Key">
            {activeCredentials?.consumerKey}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Consumer Secret">
            {activeCredentials?.consumerSecret}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay isSensitive label="Consumer Key">
            {inactiveCredentials?.consumerKey}
          </CredentialDisplay>
          <CredentialDisplay isSensitive label="Consumer Secret">
            {inactiveCredentials?.consumerSecret}
          </CredentialDisplay>
        </>
      }
    />
  );
};
