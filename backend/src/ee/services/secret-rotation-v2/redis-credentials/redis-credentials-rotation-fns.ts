/* eslint-disable no-await-in-loop */
import Redis from "ioredis";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { DEFAULT_PASSWORD_REQUIREMENTS, generatePassword } from "../shared/utils";
import {
  TRedisCredentialsRotationGeneratedCredentials,
  TRedisCredentialsRotationWithConnection
} from "./redis-credentials-rotation-types";

const redactPasswords = (e: unknown, credentials: TRedisCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

export const redisCredentialsRotationFactory: TRotationFactory<
  TRedisCredentialsRotationWithConnection,
  TRedisCredentialsRotationGeneratedCredentials
> = (secretRotation) => {
  const { connection, secretsMapping, parameters } = secretRotation;

  const $getClient = async () => {
    const [hostIp] = await verifyHostInputValidity({ host: connection.credentials.host, isDynamicSecret: false });

    let conn: Redis | null = null;
    try {
      conn = new Redis({
        username: connection.credentials.username,
        host: hostIp,
        port: connection.credentials.port,
        password: connection.credentials.password,
        ...(connection.credentials.sslEnabled && {
          tls: {
            rejectUnauthorized: connection.credentials.sslRejectUnauthorized,
            ca: connection.credentials.sslCertificate
          }
        })
      });

      let result: string;
      if (connection.credentials.password) {
        result = await conn.auth(connection.credentials.username, connection.credentials.password, () => {});
      } else {
        result = await conn.auth(connection.credentials.username, () => {});
      }

      if (result !== "OK") {
        throw new BadRequestError({ message: `Invalid credentials, Redis returned ${result} status` });
      }

      return conn;
    } catch (err) {
      if (conn) await conn.quit();

      throw err;
    }
  };

  /**
   * Creates a new user and password for the redis user using ACL
   */
  const $rotateAclUser = async () => {
    let client: Redis | null = null;

    const username = generatePassword({
      length: 32,
      required: {
        symbols: 0,
        digits: 5,
        uppercase: 5,
        lowercase: 5
      }
    });

    const password = generatePassword(parameters.passwordRequirements || DEFAULT_PASSWORD_REQUIREMENTS);

    try {
      client = await $getClient();

      // important: permissionScope is user input so we need to sanitize it, which we do by splitting the permission scope into parts and then passing them to the ACL command as separate arguments
      const permissionParts = parameters.permissionScope.split(" ");
      await client.call("ACL", "SETUSER", username, `>${password}`, "on", ...permissionParts);

      return {
        username,
        password
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Unable to rotate credentials: ${redactPasswords(error, [{ username, password }])}`
      });
    } finally {
      if (client) await client.quit();
    }
  };

  /**
   * Revokes a ACL password from the Redis server using its username and password.
   */
  const revokeCredential = async (username: string) => {
    let client: Redis | null = null;

    try {
      client = await $getClient();
      await client.call("ACL", "DELUSER", username);
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Unable to revoke credential: ${redactPasswords(error, [{ username, password: username }])}`
      });
    } finally {
      if (client) await client.quit();
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TRedisCredentialsRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateAclUser();

    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TRedisCredentialsRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { username } of credentials) {
      await revokeCredential(username);
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TRedisCredentialsRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    const newCredentials = await $rotateAclUser();

    if (oldCredentials?.username) {
      await revokeCredential(oldCredentials.username);
    }

    return callback(newCredentials);
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TRedisCredentialsRotationGeneratedCredentials> = ({
    username,
    password
  }) => [
    { key: secretsMapping.username, value: username },
    { key: secretsMapping.password, value: password }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
