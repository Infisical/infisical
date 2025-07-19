/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { delay as delayMs } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { getOktaInstanceUrl } from "@app/services/app-connection/okta";

import {
  TOktaClientSecret,
  TOktaClientSecretRotationGeneratedCredentials,
  TOktaClientSecretRotationWithConnection
} from "./okta-client-secret-rotation-types";

type OktaErrorResponse = { errorCode: string; errorSummary: string; errorCauses?: { errorSummary: string }[] };

const isOktaErrorResponse = (data: unknown): data is OktaErrorResponse => {
  return (
    typeof data === "object" &&
    data !== null &&
    "errorSummary" in data &&
    typeof (data as OktaErrorResponse).errorSummary === "string"
  );
};

const createErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    if (error.response?.data && isOktaErrorResponse(error.response.data)) {
      const oktaError = error.response.data;
      if (oktaError.errorCauses && oktaError.errorCauses.length > 0) {
        return oktaError.errorCauses[0].errorSummary;
      }
      return oktaError.errorSummary;
    }
    if (error.message) {
      return error.message;
    }
  }
  return "Unknown error";
};

// Delay between each revocation call in revokeCredentials
const DELAY_MS = 1000;

export const oktaClientSecretRotationFactory: TRotationFactory<
  TOktaClientSecretRotationWithConnection,
  TOktaClientSecretRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { clientId },
    secretsMapping
  } = secretRotation;

  /**
   * Creates a new client secret for the Okta app.
   */
  const $rotateClientSecret = async () => {
    const instanceUrl = await getOktaInstanceUrl(connection);

    try {
      const { data } = await request.post<TOktaClientSecret>(
        `${instanceUrl}/api/v1/apps/${clientId}/credentials/secrets`,
        {},
        {
          headers: {
            Accept: "application/json",
            Authorization: `SSWS ${connection.credentials.apiToken}`
          }
        }
      );

      if (!data.client_secret || !data.id) {
        throw new Error("Invalid response from Okta: missing 'client_secret' or secret 'id'.");
      }

      return {
        clientSecret: data.client_secret,
        secretId: data.id,
        clientId
      };
    } catch (error: unknown) {
      if (
        error instanceof AxiosError &&
        error.response?.data &&
        isOktaErrorResponse(error.response.data) &&
        error.response.data.errorCode === "E0000001"
      ) {
        // Okta has a maximum of 2 secrets per app, thus we must warn the users in case they already have 2
        throw new BadRequestError({
          message: `Failed to add client secret to Okta app ${clientId}: You must have only a single secret for the Okta app prior to creating this secret rotation.`
        });
      }

      throw new BadRequestError({
        message: `Failed to add client secret to Okta app ${clientId}: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * List client secrets.
   */
  const $listClientSecrets = async () => {
    const instanceUrl = await getOktaInstanceUrl(connection);

    try {
      const { data } = await request.get<TOktaClientSecret[]>(
        `${instanceUrl}/api/v1/apps/${clientId}/credentials/secrets`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `SSWS ${connection.credentials.apiToken}`
          }
        }
      );

      return data;
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to list client secrets for Okta app ${clientId}: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Checks if a credential with the given secretId exists.
   */
  const credentialExists = async (secretId: string): Promise<boolean> => {
    const instanceUrl = await getOktaInstanceUrl(connection);

    try {
      const { data } = await request.get<TOktaClientSecret>(
        `${instanceUrl}/api/v1/apps/${clientId}/credentials/secrets/${secretId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `SSWS ${connection.credentials.apiToken}`
          }
        }
      );

      return data.id === secretId;
    } catch (_) {
      return false;
    }
  };

  /**
   * Revokes a client secret from the Okta app using its secretId.
   * First checks if the credential exists before attempting revocation.
   */
  const revokeCredential = async (secretId: string) => {
    // Check if credential exists before attempting revocation
    const exists = await credentialExists(secretId);
    if (!exists) {
      return; // Credential doesn't exist, nothing to revoke
    }

    const instanceUrl = await getOktaInstanceUrl(connection);

    try {
      // First deactivate the secret
      await request.post(
        `${instanceUrl}/api/v1/apps/${clientId}/credentials/secrets/${secretId}/lifecycle/deactivate`,
        undefined,
        {
          headers: {
            Authorization: `SSWS ${connection.credentials.apiToken}`
          }
        }
      );

      // Then delete it
      await request.delete(`${instanceUrl}/api/v1/apps/${clientId}/credentials/secrets/${secretId}`, {
        headers: {
          Authorization: `SSWS ${connection.credentials.apiToken}`
        }
      });
    } catch (error: unknown) {
      if (
        error instanceof AxiosError &&
        error.response?.data &&
        isOktaErrorResponse(error.response.data) &&
        error.response.data.errorCode === "E0000001"
      ) {
        // If this is the last secret, we cannot revoke it
        return;
      }

      throw new BadRequestError({
        message: `Failed to remove client secret with secretId ${secretId} from app ${clientId}: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TOktaClientSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TOktaClientSecretRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { secretId } of credentials) {
      await revokeCredential(secretId);
      await delayMs(DELAY_MS);
    }
    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TOktaClientSecretRotationGeneratedCredentials> = async (
    oldCredentials,
    callback,
    activeCredentials
  ) => {
    // Since in Okta you can only have a maximum of 2 secrets at a time, we must delete any other secret besides the current one PRIOR to generating the second secret
    if (oldCredentials?.secretId) {
      await revokeCredential(oldCredentials.secretId);
    } else if (activeCredentials) {
      // On the first rotation oldCredentials won't be set so we must find the second secret manually
      const secrets = await $listClientSecrets();

      if (secrets.length > 1) {
        const nonActiveSecret = secrets.find((secret) => secret.id !== activeCredentials.secretId);
        if (nonActiveSecret) {
          await revokeCredential(nonActiveSecret.id);
        }
      }
    }

    const newCredentials = await $rotateClientSecret();
    return callback(newCredentials);
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TOktaClientSecretRotationGeneratedCredentials> = ({
    clientSecret
  }) => [
    { key: secretsMapping.clientId, value: clientId },
    { key: secretsMapping.clientSecret, value: clientSecret }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
