import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
} from "../pam-resource-types";
import { SSHAuthMethod } from "./ssh-resource-enums";
import { TSSHAccountCredentials, TSSHResourceConnectionDetails } from "./ssh-resource-types";

export const sshResourceFactory: TPamResourceFactory<TSSHResourceConnectionDetails, TSSHAccountCredentials> = (
  resourceType,
  connectionDetails,
  gatewayId,
  gatewayV2Service
) => {
  const validateConnection = async () => {
    return connectionDetails;
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TSSHAccountCredentials> = async (
    credentials
  ) => {
    return credentials;
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TSSHAccountCredentials> = async (
    rotationAccountCredentials,
    currentCredentials
  ) => {
    return rotationAccountCredentials;
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TSSHAccountCredentials,
    currentCredentials: TSSHAccountCredentials
  ) => {
    if (updatedAccountCredentials.authMethod !== currentCredentials.authMethod) {
      return updatedAccountCredentials;
    }

    if (
      updatedAccountCredentials.authMethod === SSHAuthMethod.Password &&
      currentCredentials.authMethod === SSHAuthMethod.Password
    ) {
      if (updatedAccountCredentials.password === "__INFISICAL_UNCHANGED__") {
        return {
          ...updatedAccountCredentials,
          password: currentCredentials.password
        };
      }
    }

    if (
      updatedAccountCredentials.authMethod === SSHAuthMethod.PublicKey &&
      currentCredentials.authMethod === SSHAuthMethod.PublicKey
    ) {
      if (updatedAccountCredentials.privateKey === "__INFISICAL_UNCHANGED__") {
        return {
          ...updatedAccountCredentials,
          privateKey: currentCredentials.privateKey
        };
      }
    }

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
