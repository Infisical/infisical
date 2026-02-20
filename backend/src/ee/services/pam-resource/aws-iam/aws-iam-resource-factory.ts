import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceMetadata
} from "../pam-resource-types";
import { validatePamRoleConnection, validateTargetRoleAssumption } from "./aws-iam-federation";
import { TAwsIamAccountCredentials, TAwsIamResourceConnectionDetails } from "./aws-iam-resource-types";

export const awsIamResourceFactory: TPamResourceFactory<
  TAwsIamResourceConnectionDetails,
  TAwsIamAccountCredentials,
  TPamResourceMetadata
> = (
  resourceType: PamResource,
  connectionDetails: TAwsIamResourceConnectionDetails,
  // AWS IAM doesn't use gateway
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gatewayId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gatewayV2Service,
  projectId
) => {
  const validateConnection = async () => {
    try {
      const isValid = await validatePamRoleConnection(connectionDetails, projectId ?? "");

      if (!isValid) {
        throw new BadRequestError({
          message:
            "Unable to assume the PAM role. Verify the role ARN and ensure the trust policy allows Infisical to assume the role."
        });
      }

      logger.info(
        { roleArn: connectionDetails.roleArn },
        "[AWS IAM Resource Factory] PAM role connection validated successfully"
      );

      return connectionDetails;
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      logger.error(error, "[AWS IAM Resource Factory] Failed to validate PAM role connection");

      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TAwsIamAccountCredentials> = async (
    credentials
  ) => {
    try {
      const isValid = await validateTargetRoleAssumption({
        connectionDetails,
        targetRoleArn: credentials.targetRoleArn,
        projectId: projectId ?? ""
      });

      if (!isValid) {
        throw new BadRequestError({
          message: `Unable to assume the target role. Verify the target role ARN and ensure the PAM role (ARN: ${connectionDetails.roleArn}) has permission to assume it.`
        });
      }

      logger.info(
        { targetRoleArn: credentials.targetRoleArn },
        "[AWS IAM Resource Factory] Target role credentials validated successfully"
      );

      return credentials;
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      logger.error(error, "[AWS IAM Resource Factory] Failed to validate target role credentials");

      throw new BadRequestError({
        message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TAwsIamAccountCredentials> = async (
    _rotationAccountCredentials,
    currentCredentials
  ) => {
    return currentCredentials;
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TAwsIamAccountCredentials,
    // AWS IAM has no censored credential values - role ARNs are not secrets
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _currentCredentials: TAwsIamAccountCredentials
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
