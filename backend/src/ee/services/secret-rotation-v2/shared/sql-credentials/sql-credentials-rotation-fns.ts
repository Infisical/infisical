import { randomInt } from "crypto";

import {
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { getSqlConnectionClient, SQL_CONNECTION_ALTER_LOGIN_STATEMENT } from "@app/services/app-connection/shared/sql";

import {
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationWithConnection
} from "./sql-credentials-rotation-types";

const DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 48,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  },
  allowedSymbols: "-_.~!*"
};

const generatePassword = () => {
  try {
    const { length, required, allowedSymbols } = DEFAULT_PASSWORD_REQUIREMENTS;

    const chars = {
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      digits: "0123456789",
      symbols: allowedSymbols || "-_.~!*"
    };

    const parts: string[] = [];

    if (required.lowercase > 0) {
      parts.push(
        ...Array(required.lowercase)
          .fill(0)
          .map(() => chars.lowercase[randomInt(chars.lowercase.length)])
      );
    }

    if (required.uppercase > 0) {
      parts.push(
        ...Array(required.uppercase)
          .fill(0)
          .map(() => chars.uppercase[randomInt(chars.uppercase.length)])
      );
    }

    if (required.digits > 0) {
      parts.push(
        ...Array(required.digits)
          .fill(0)
          .map(() => chars.digits[randomInt(chars.digits.length)])
      );
    }

    if (required.symbols > 0) {
      parts.push(
        ...Array(required.symbols)
          .fill(0)
          .map(() => chars.symbols[randomInt(chars.symbols.length)])
      );
    }

    const requiredTotal = Object.values(required).reduce<number>((a, b) => a + b, 0);
    const remainingLength = Math.max(length - requiredTotal, 0);

    const allowedChars = Object.entries(chars)
      .filter(([key]) => required[key as keyof typeof required] > 0)
      .map(([, value]) => value)
      .join("");

    parts.push(
      ...Array(remainingLength)
        .fill(0)
        .map(() => allowedChars[randomInt(allowedChars.length)])
    );

    // shuffle the array to mix up the characters
    for (let i = parts.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }

    return parts.join("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to generate password: ${message}`);
  }
};

const redactPasswords = (e: unknown, credentials: TSqlCredentialsRotationGeneratedCredentials) => {
  const error = e as Error;

  if (!error?.message) return "Unknown error";

  let redactedMessage = error.message;

  credentials.forEach(({ password }) => {
    redactedMessage = redactedMessage.replaceAll(password, "*******************");
  });

  return redactedMessage;
};

export const sqlCredentialsRotationFactory = (secretRotation: TSqlCredentialsRotationWithConnection) => {
  const {
    connection,
    parameters: { username1, username2 },
    activeIndex,
    secretsMapping
  } = secretRotation;

  const validateCredentials = async (credentials: TSqlCredentialsRotationGeneratedCredentials[number]) => {
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

  const issueCredentials: TRotationFactoryIssueCredentials = async (callback) => {
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
      await validateCredentials(credentials);
    }

    return callback(credentialsSet[0]);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials = async (credentialsToRevoke, callback) => {
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

  const rotateCredentials: TRotationFactoryRotateCredentials = async (_, callback) => {
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

    await validateCredentials(credentials);

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload = (generatedCredentials) => {
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
    getSecretsPayload,
    validateCredentials
  };
};
