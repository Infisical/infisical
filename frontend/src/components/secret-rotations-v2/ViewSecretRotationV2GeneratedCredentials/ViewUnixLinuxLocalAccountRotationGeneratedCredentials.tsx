import { TUnixLinuxLocalAccountRotationGeneratedCredentialsResponse } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";

import { CredentialDisplay, ViewRotationGeneratedCredentialsDisplay } from "./shared";

type Props = {
  generatedCredentialsResponse: TUnixLinuxLocalAccountRotationGeneratedCredentialsResponse;
};

export const ViewUnixLinuxLocalAccountRotationGeneratedCredentials = ({
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
