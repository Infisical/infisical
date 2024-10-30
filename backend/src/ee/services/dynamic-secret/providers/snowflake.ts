import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import snowflake from "snowflake-sdk";
import { z } from "zod";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretSnowflakeSchema, TDynamicProviderFns } from "./models";

// destroy client requires callback...
const noop = () => {};

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = () => {
  return `infisical_${alphaNumericNanoId(32)}`; // username must start with alpha character, hence prefix
};

const getDaysToExpiry = (expiryDate: Date) => {
  const start = new Date().getTime();
  const end = new Date(expiryDate).getTime();
  const diffTime = Math.abs(end - start);

  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const SnowflakeProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSnowflakeSchema.parseAsync(inputs);
    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretSnowflakeSchema>) => {
    const client = snowflake.createConnection({
      account: `${providerInputs.orgId}-${providerInputs.accountId}`,
      username: providerInputs.username,
      password: providerInputs.password,
      application: "Infisical"
    });

    await new Promise((resolve, reject) => {
      client.connect((err) => {
        if (err) {
          return reject(err);
        }

        return resolve(true);
      });
    });

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await getClient(providerInputs);

    const isValidConnection = await client.isValidAsync();

    client.destroy(noop);

    return isValidConnection;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);

    const client = await getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();
    const expiration = getDaysToExpiry(new Date(expireAt));

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration
    });

    try {
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
    } finally {
      client.destroy(noop);
    }

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await validateProviderInputs(inputs);

    const client = await getClient(providerInputs);

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });

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
    } finally {
      client.destroy(noop);
    }

    return { entityId: username };
  };

  const renew = async (inputs: unknown, username: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);

    const client = await getClient(providerInputs);

    const expiration = getDaysToExpiry(new Date(expireAt));

    const renewStatement = handlebars.compile(providerInputs.renewStatement)({
      username,
      expiration
    });

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
    } finally {
      client.destroy(noop);
    }

    return { entityId: username };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
