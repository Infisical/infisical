/* eslint-disable no-await-in-loop */
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { executeClickHouseStatement, executeWithClickHouseClient } from "@app/services/app-connection/clickhouse";

import { DEFAULT_PASSWORD_REQUIREMENTS, generatePassword } from "../shared/utils";
import {
  TClickHouseCredentialsRotationGeneratedCredentials,
  TClickHouseCredentialsRotationWithConnection
} from "./clickhouse-credentials-rotation-types";

// ClickHouse servers can enforce password complexity rules that require a symbol
const CLICKHOUSE_PASSWORD_REQUIREMENTS = {
  ...DEFAULT_PASSWORD_REQUIREMENTS,
  required: { ...DEFAULT_PASSWORD_REQUIREMENTS.required, symbols: 1 }
};

const redactPasswords = (e: unknown, credentials: TClickHouseCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

const escapeIdentifier = (identifier: string) => identifier.replaceAll("\\", "\\\\").replaceAll("`", "\\`");

export const clickhouseCredentialsRotationFactory: TRotationFactory<
  TClickHouseCredentialsRotationWithConnection,
  TClickHouseCredentialsRotationGeneratedCredentials
> = (secretRotation, _appConnectionDAL, _kmsService, gatewayV2Service, gatewayPoolService) => {
  const {
    connection,
    parameters: { username1, username2 },
    activeIndex,
    secretsMapping
  } = secretRotation;

  if (connection.credentials.username === username1 || connection.credentials.username === username2) {
    throw new BadRequestError({
      message:
        "Rotation username cannot be the same as the connection username. The connection credentials are used to execute rotation operations and changing their password would break the connection."
    });
  }

  if (username1 === username2) {
    throw new BadRequestError({
      message:
        "Rotation usernames must be two different users. Rotation alternates between them so one user's password stays valid while the other's changes."
    });
  }

  const gatewayDeps = { gatewayV2Service, gatewayPoolService };

  const $setPasswords = async (credentialsSet: TClickHouseCredentialsRotationGeneratedCredentials) => {
    try {
      await executeWithClickHouseClient(connection, gatewayDeps, async (client) => {
        for (const { username, password } of credentialsSet) {
          await executeClickHouseStatement(
            client,
            `ALTER USER \`${escapeIdentifier(username)}\` IDENTIFIED WITH sha256_password BY '${password}'`
          );
        }
      });
    } catch (error) {
      throw new Error(redactPasswords(error, credentialsSet));
    }
  };

  const $validateCredentials = async (credentials: TClickHouseCredentialsRotationGeneratedCredentials[number]) => {
    try {
      await executeWithClickHouseClient(
        { ...connection, credentials: { ...connection.credentials, ...credentials } },
        gatewayDeps,
        (client) => executeClickHouseStatement(client, "SELECT 1")
      );
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TClickHouseCredentialsRotationGeneratedCredentials> = async (
    callback
  ) => {
    // For ClickHouse, since we get existing users, we change both their passwords
    // on issue to invalidate their existing passwords
    const credentialsSet = [
      { username: username1, password: generatePassword(CLICKHOUSE_PASSWORD_REQUIREMENTS) },
      { username: username2, password: generatePassword(CLICKHOUSE_PASSWORD_REQUIREMENTS) }
    ];

    await $setPasswords(credentialsSet);

    for (const credentials of credentialsSet) {
      await $validateCredentials(credentials);
    }

    return callback(credentialsSet[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TClickHouseCredentialsRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    await $setPasswords(
      credentialsToRevoke.map(({ username }) => ({
        username,
        password: generatePassword(CLICKHOUSE_PASSWORD_REQUIREMENTS)
      }))
    );

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TClickHouseCredentialsRotationGeneratedCredentials
  > = async (_, callback) => {
    const credentials = {
      username: activeIndex === 0 ? username2 : username1,
      password: generatePassword(CLICKHOUSE_PASSWORD_REQUIREMENTS)
    };

    await $setPasswords([credentials]);
    await $validateCredentials(credentials);

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TClickHouseCredentialsRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.username, value: generatedCredentials.username },
    { key: secretsMapping.password, value: generatedCredentials.password }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials: $validateCredentials
  };
};
