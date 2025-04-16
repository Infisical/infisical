import {
  AzureAddPasswordResponse,
  TAzureClientSecretRotationGeneratedCredentials,
  TAzureClientSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/azure-client-secret/azure-client-secret-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-client-secrets";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export const azureClientSecretRotationFactory: TRotationFactory<
  TAzureClientSecretRotationWithConnection,
  TAzureClientSecretRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { appId },
    secretsMapping,
    rotationInterval
  } = secretRotation;

  /**
   * Creates a new client secret for the Azure app.
   */
  const $rotateClientSecret = async () => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${appId}/addPassword`;

    await blockLocalAndPrivateIpAddresses(endpoint);

    const endDateTime = new Date();
    console.log({ rotationInterval })
    endDateTime.setDate(endDateTime.getDate() + rotationInterval);

    try {
      const { data } = await request.post<AzureAddPasswordResponse>(
        endpoint,
        {
          passwordCredential: {
            displayName: "Infisical Auto-Rotated Secret",
            endDateTime: endDateTime.toISOString()
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data?.secretText || !data?.keyId) {
        throw new Error("Invalid response from Azure: missing secretText or keyId.");
      }

      return {
        clientSecret: data.secretText,
        clientId: data.keyId
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to add client secret to Azure app ${appId}: ${message}`);
    }
  };

  /**
   * Revokes a client secret from the Azure app using its keyId.
   */
  const revokeCredential = async (clientId: string) => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${appId}/removePassword`;

    await blockLocalAndPrivateIpAddresses(endpoint);

    try {
      await request.post(
        endpoint,
        { keyId: clientId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to remove client secret with keyId ${clientId} from app ${appId}: ${message}`);
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ clientId }) => revokeCredential(clientId)));
    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    const newCredentials = await $rotateClientSecret();

    if (oldCredentials?.clientId) {
      await revokeCredential(oldCredentials.clientId);
    }

    return callback(newCredentials);
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAzureClientSecretRotationGeneratedCredentials> = ({
    clientSecret,
    clientId
  }) => [
    { key: secretsMapping.clientSecret, value: clientSecret },
    { key: secretsMapping.clientId, value: clientId }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
