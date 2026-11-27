import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import snowflake from "snowflake-sdk";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import {
  assertSnowflakeStatementSupported,
  isSnowflakeFileTransferStatement,
  SNOWFLAKE_ARRAY_BINDING_THRESHOLD
} from "@app/services/app-connection/snowflake/snowflake-connection-fns";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretSnowflakeSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

// destroy client requires callback...
const noop = () => {};

export class SnowflakeUnsupportedStatementError extends BadRequestError {
  constructor({ message }: { message: string }) {
    super({ message });
  }
}

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

const getDaysToExpiry = (expiryDate: Date) => {
  const start = new Date().getTime();
  const end = new Date(expiryDate).getTime();
  const diffTime = Math.abs(end - start);

  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Parses inputs and templates without the PUT and GET check; revoke and renew check only their own statement
export const parseSnowflakeProviderInputs = async (inputs: unknown) => {
  const providerInputs = await DynamicSecretSnowflakeSchema.parseAsync(inputs);
  validateHandlebarTemplate("Snowflake creation", providerInputs.creationStatement, {
    allowedExpressions: (val) => ["username", "password", "expiration"].includes(val)
  });
  if (providerInputs.renewStatement) {
    validateHandlebarTemplate("Snowflake renew", providerInputs.renewStatement, {
      allowedExpressions: (val) => ["username", "expiration"].includes(val)
    });
  }
  validateHandlebarTemplate("Snowflake revoke", providerInputs.revocationStatement, {
    allowedExpressions: (val) => ["username"].includes(val)
  });
  return providerInputs;
};

export const getSnowflakeProviderConnectionOptions = (
  providerInputs: z.infer<typeof DynamicSecretSnowflakeSchema>
): snowflake.ConnectionOptions => ({
  account: `${providerInputs.orgId}-${providerInputs.accountId}`,
  username: providerInputs.username,
  password: providerInputs.password,
  application: "Infisical",
  arrayBindingThreshold: SNOWFLAKE_ARRAY_BINDING_THRESHOLD
});

export const renderSnowflakeStatement = (template: string, values: Record<string, unknown>) => {
  const statement = handlebars.compile(template, { noEscape: true })(values);
  assertSnowflakeStatementSupported(statement);
  return statement;
};

export const SnowflakeProvider = (): TDynamicProviderFns => {
  // Checks all three statements, unlike parseSnowflakeProviderInputs
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await parseSnowflakeProviderInputs(inputs);
    if (
      [providerInputs.creationStatement, providerInputs.revocationStatement, providerInputs.renewStatement].some(
        (statement) => statement && isSnowflakeFileTransferStatement(statement)
      )
    ) {
      throw new SnowflakeUnsupportedStatementError({ message: "PUT and GET statements are not supported" });
    }

    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSnowflakeSchema>) => {
    const client = snowflake.createConnection(getSnowflakeProviderConnectionOptions(providerInputs));

    await client.connectAsync(noop);

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    let client;
    try {
      client = await $getClient(providerInputs);
      const isValidConnection = await Promise.race([
        client.isValidAsync(),
        new Promise((resolve) => {
          setTimeout(resolve, 10000);
        }).then(() => {
          throw new BadRequestError({ message: "Unable to establish connection - verify credentials" });
        })
      ]);
      return isValidConnection;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.password, providerInputs.username, providerInputs.accountId, providerInputs.orgId]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    } finally {
      if (client) client.destroy(noop);
    }
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, expireAt, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const client = await $getClient(providerInputs);

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      // Username must start with an ascii letter, so we prepend the username with "infisical_"
      usernamePrefix: "infisical_"
    });
    const password = generatePassword();

    try {
      const expiration = getDaysToExpiry(new Date(expireAt));
      const creationStatement = renderSnowflakeStatement(providerInputs.creationStatement, {
        username,
        password,
        expiration
      });

      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: creationStatement,
          complete(err) {
            if (err) {
              return reject(err);
            }

            return resolve(true);
          }
        });
      });
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error).message,
        tokens: [username, password, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({ message: `Failed to create lease from provider: ${sanitizedErrorMessage}` });
    } finally {
      client.destroy(noop);
    }

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await parseSnowflakeProviderInputs(inputs);
    const revokeStatement = renderSnowflakeStatement(providerInputs.revocationStatement, { username });

    const client = await $getClient(providerInputs);

    try {
      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: revokeStatement,
          complete(err) {
            if (err) {
              return reject(err);
            }

            return resolve(true);
          }
        });
      });
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error).message,
        tokens: [username, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({ message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}` });
    } finally {
      client.destroy(noop);
    }

    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await parseSnowflakeProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };
    const renewStatement = renderSnowflakeStatement(providerInputs.renewStatement, {
      username: entityId,
      expiration: getDaysToExpiry(new Date(expireAt))
    });

    const client = await $getClient(providerInputs);

    try {
      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: renewStatement,
          complete(err) {
            if (err) {
              return reject(err);
            }

            return resolve(true);
          }
        });
      });
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error).message,
        tokens: [entityId, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({ message: `Failed to renew lease from provider: ${sanitizedErrorMessage}` });
    } finally {
      client.destroy(noop);
    }

    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
