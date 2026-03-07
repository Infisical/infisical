import { BadRequestError } from "@app/lib/errors";

import { TPamResourceFactory, TPamResourceInternalMetadata } from "../pam-resource-types";
import { TWebAppResourceConnectionDetails } from "./webapp-resource-types";

// WebApp resources don't have account credentials — access is direct via the proxy
type TWebAppAccountCredentials = Record<string, never>;

export const webAppResourceFactory: TPamResourceFactory<
  TWebAppResourceConnectionDetails,
  TWebAppAccountCredentials,
  TPamResourceInternalMetadata
> = (_resourceType, connectionDetails) => {
  const validateConnection = async () => {
    // No connection validation for web resources at creation time.
    // The actual connectivity is verified when a user starts a session.
    return connectionDetails;
  };

  const validateAccountCredentials = async (credentials: TWebAppAccountCredentials) => {
    return credentials;
  };

  const rotateAccountCredentials = async () => {
    throw new BadRequestError({ message: "Credential rotation is not supported for web resources" });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TWebAppAccountCredentials
  ) => {
    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
