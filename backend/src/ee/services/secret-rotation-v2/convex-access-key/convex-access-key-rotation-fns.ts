import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TConvexConnection } from "@app/services/app-connection/convex";

import {
  TConvexAccessKeyRotationGeneratedCredentials,
  TConvexAccessKeyRotationWithConnection
} from "./convex-access-key-rotation-types";

const getConvexApiBaseUrl = async (connection: TConvexConnection) => {
  const baseUrl = connection.credentials.instanceUrl || "https://api.convex.dev";
  await blockLocalAndPrivateIpAddresses(baseUrl);
  return baseUrl;
};

const $createAccessKey = async (
  connection: TConvexConnection,
  namePrefix: string
): Promise<{ accessKeyId: string; accessKey: string }> => {
  const baseUrl = await getConvexApiBaseUrl(connection);
  const name = `${namePrefix}-${Date.now()}`;

  try {
    const { data } = await request.post<{ accessToken: string }>(
      `${baseUrl}/v1/create_personal_access_token`,
      { name },
      {
        headers: {
          Authorization: `Bearer ${connection.credentials.accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!data?.accessToken) {
      throw new BadRequestError({ message: "Convex access key response missing 'accessToken'" });
    }

    return { accessKeyId: name, accessKey: data.accessToken };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to create Convex access key: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

const $deleteAccessKey = async (connection: TConvexConnection, accessKeyId: string): Promise<void> => {
  const baseUrl = await getConvexApiBaseUrl(connection);

  try {
    await request.post(
      `${baseUrl}/v1/delete_personal_access_token`,
      { id: accessKeyId },
      {
        headers: {
          Authorization: `Bearer ${connection.credentials.accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) return;
    throw new BadRequestError({
      message: `Failed to delete Convex access key ${accessKeyId}: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

const $checkAccessKey = async (connection: TConvexConnection, accessKey: string): Promise<void> => {
  const baseUrl = await getConvexApiBaseUrl(connection);

  try {
    await request.get(`${baseUrl}/v1/list_personal_access_tokens`, {
      headers: {
        Authorization: `Bearer ${accessKey}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Convex access key verification failed: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

export const convexAccessKeyRotationFactory: TRotationFactory<
  TConvexAccessKeyRotationWithConnection,
  TConvexAccessKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    parameters: { namePrefix },
    secretsMapping
  } = secretRotation;

  const issueCredentials: TRotationFactoryIssueCredentials<TConvexAccessKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createAccessKey(connection, namePrefix);
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TConvexAccessKeyRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteAccessKey(connection, credential.accessKeyId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `convexAccessKeyRotation: failed to revoke key during cleanup [rotationId=${rotationId}] [keyId=${generatedCredentials[index].accessKeyId}]`
        );
      }
    });

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TConvexAccessKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const credentials = await $createAccessKey(connection, namePrefix);

    if (credentialsToRevoke?.accessKeyId) {
      try {
        await $deleteAccessKey(connection, credentialsToRevoke.accessKeyId);
      } catch (revokeError) {
        logger.error(
          revokeError,
          `convexAccessKeyRotation: failed to revoke previous key after rotation [rotationId=${rotationId}] [keyId=${credentialsToRevoke.accessKeyId}]`
        );
      }
    }

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TConvexAccessKeyRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [{ key: secretsMapping.accessKey, value: generatedCredentials.accessKey }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials: async ({ accessKey }) => {
      await $checkAccessKey(connection, accessKey);
    }
  };
};
