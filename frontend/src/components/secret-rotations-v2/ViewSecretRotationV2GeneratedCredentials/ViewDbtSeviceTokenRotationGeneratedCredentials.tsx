import { CredentialDisplay } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/shared/CredentialDisplay";
import { TDbtServiceTokenRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/dbt-service-token-rotation";

import { ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TDbtServiceTokenRotationGeneratedCredentialsResponse;
};

export const ViewDbtServiceTokenRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="Token Name">{activeCredentials?.tokenName}</CredentialDisplay>
          <CredentialDisplay label="Token ID">
            {(activeCredentials?.tokenId || "")?.toString()}
          </CredentialDisplay>
          <CredentialDisplay label="Service Token">
            {activeCredentials?.serviceToken}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="Token Name">{inactiveCredentials?.tokenName}</CredentialDisplay>
          <CredentialDisplay label="Token ID">
            {(inactiveCredentials?.tokenId || "")?.toString()}
          </CredentialDisplay>
          <CredentialDisplay label="Service Token">
            {inactiveCredentials?.serviceToken}
          </CredentialDisplay>
        </>
      }
    />
  );
};
