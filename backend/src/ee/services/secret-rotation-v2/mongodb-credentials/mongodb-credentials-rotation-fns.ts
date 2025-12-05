/* eslint-disable no-await-in-loop */
import { MongoClient } from "mongodb";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { createMongoClient } from "@app/services/app-connection/mongodb/mongodb-connection-fns";

import { DEFAULT_PASSWORD_REQUIREMENTS, generatePassword } from "../shared/utils";
import {
  TMongoDBCredentialsRotationGeneratedCredentials,
  TMongoDBCredentialsRotationWithConnection
} from "./mongodb-credentials-rotation-types";

const redactPasswords = (e: unknown, credentials: TMongoDBCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

export const mongodbCredentialsRotationFactory: TRotationFactory<
  TMongoDBCredentialsRotationWithConnection,
  TMongoDBCredentialsRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { username1, username2 },
    activeIndex,
    secretsMapping
  } = secretRotation;

  const passwordRequirement = DEFAULT_PASSWORD_REQUIREMENTS;

  const $getClient = async () => {
    let client: MongoClient | null = null;
    try {
      client = await createMongoClient(connection.credentials, { validateConnection: true });
      return client;
    } catch (err) {
      if (client) await client.close();
      throw err;
    }
  };

  const $validateCredentials = async (credentials: TMongoDBCredentialsRotationGeneratedCredentials[number]) => {
    let client: MongoClient | null = null;
    try {
      client = await createMongoClient(connection.credentials, {
        authCredentials: {
          username: credentials.username,
          password: credentials.password
        },
        validateConnection: true
      });
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    } finally {
      if (client) await client.close();
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TMongoDBCredentialsRotationGeneratedCredentials> = async (
    callback
  ) => {
    // For MongoDB, since we get existing users, we change both their passwords
    // on issue to invalidate their existing passwords
    const credentialsSet = [
      { username: username1, password: generatePassword(passwordRequirement) },
      { username: username2, password: generatePassword(passwordRequirement) }
    ];

    let client: MongoClient | null = null;
    try {
      client = await $getClient();
      const db = client.db(connection.credentials.database);

      for (const credentials of credentialsSet) {
        await db.command({
          updateUser: credentials.username,
          pwd: credentials.password
        });
      }
    } catch (error) {
      throw new Error(redactPasswords(error, credentialsSet));
    } finally {
      if (client) await client.close();
    }

    for (const credentials of credentialsSet) {
      await $validateCredentials(credentials);
    }

    return callback(credentialsSet[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TMongoDBCredentialsRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const revokedCredentials = credentialsToRevoke.map(({ username }) => ({
      username,
      password: generatePassword(passwordRequirement)
    }));

    let client: MongoClient | null = null;
    try {
      client = await $getClient();
      const db = client.db(connection.credentials.database);

      for (const credentials of revokedCredentials) {
        await db.command({
          updateUser: credentials.username,
          pwd: credentials.password
        });
      }
    } catch (error) {
      throw new Error(redactPasswords(error, revokedCredentials));
    } finally {
      if (client) await client.close();
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TMongoDBCredentialsRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const credentials = {
      username: activeIndex === 0 ? username2 : username1,
      password: generatePassword(passwordRequirement)
    };

    let client: MongoClient | null = null;
    try {
      client = await $getClient();
      const db = client.db(connection.credentials.database);

      await db.command({
        updateUser: credentials.username,
        pwd: credentials.password
      });
    } catch (error) {
      throw new Error(redactPasswords(error, [credentials]));
    } finally {
      if (client) await client.close();
    }

    await $validateCredentials(credentials);

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TMongoDBCredentialsRotationGeneratedCredentials> = (
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
