import { TLdapPasswordRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TLdapPasswordRotationGeneratedCredentialsResponse;
};

export const ViewLdapPasswordRotationGeneratedCredentials = ({
  generatedCredentialsResponse: { generatedCredentials, activeIndex }
}: Props) => {
  const inactiveIndex = activeIndex === 0 ? 1 : 0;

  const activeCredentials = generatedCredentials[activeIndex];
  const inactiveCredentials = generatedCredentials[inactiveIndex];

  return (
    <ViewRotationGeneratedCredentialsDisplay
      activeCredentials={
        <>
          <CredentialDisplay label="DN/UPN">{activeCredentials?.dn}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {activeCredentials?.password}
          </CredentialDisplay>
        </>
      }
      inactiveCredentials={
        <>
          <CredentialDisplay label="DN/UPN">{inactiveCredentials?.dn}</CredentialDisplay>
          <CredentialDisplay isSensitive label="Password">
            {inactiveCredentials?.password}
          </CredentialDisplay>
        </>
      }
    />
  );
};
