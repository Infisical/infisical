import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { getSqlConnectionClient, SQL_CONNECTION_ALTER_LOGIN_STATEMENT } from "@app/services/app-connection/shared/sql";

import { generatePassword } from "../utils";
import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "./sql-credentials-rotation-types";

const redactPasswords = (e: unknown, credentials: TSqlCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

export const sqlCredentialsRotationFactory: TRotationFactory<
  TSqlCredentialsRotationWithConnection,
  TSqlCredentialsRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { username1, username2 },
    activeIndex,
    secretsMapping
  } = secretRotation;

  const $validateCredentials = async (credentials: TSqlCredentialsRotationGeneratedCredentials[number]) => {
    const client = await getSqlConnectionClient({
      ...connection,
      credentials: {
        ...connection.credentials,
        ...credentials
      }
    });

    try {
      await client.raw("SELECT 1");
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    } finally {
      await client.destroy();
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    callback
  ) => {
    const client = await getSqlConnectionClient(connection);

    // For SQL, since we get existing users, we change both their passwords
    // on issue to invalidate their existing passwords
    const credentialsSet = [
      { username: username1, password: generatePassword() },
      { username: username2, password: generatePassword() }
    ];

    try {
      await client.transaction(async (tx) => {
        for await (const credentials of credentialsSet) {
          await tx.raw(...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[connection.app](credentials));
        }
      });
    } catch (error) {
      throw new Error(redactPasswords(error, credentialsSet));
    } finally {
      await client.destroy();
    }

    for await (const credentials of credentialsSet) {
      await $validateCredentials(credentials);
    }

    return callback(credentialsSet[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const client = await getSqlConnectionClient(connection);

    const revokedCredentials = credentialsToRevoke.map(({ username }) => ({ username, password: generatePassword() }));

    try {
      await client.transaction(async (tx) => {
        for await (const credentials of revokedCredentials) {
          // invalidate previous passwords
          await tx.raw(...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[connection.app](credentials));
        }
      });
    } catch (error) {
      throw new Error(redactPasswords(error, revokedCredentials));
    } finally {
      await client.destroy();
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TSqlCredentialsRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const client = await getSqlConnectionClient(connection);

    // generate new password for the next active user
    const credentials = { username: activeIndex === 0 ? username2 : username1, password: generatePassword() };

    try {
      await client.raw(...SQL_CONNECTION_ALTER_LOGIN_STATEMENT[connection.app](credentials));
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    } finally {
      await client.destroy();
    }

    await $validateCredentials(credentials);

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TSqlCredentialsRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    const { username, password } = secretsMapping;

    const secrets = [
      {
        key: username,
        value: generatedCredentials.username
      },
      {
        key: password,
        value: generatedCredentials.password
      }
    ];

    return secrets;
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
