import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import snowflake from "snowflake-sdk";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretSnowflakeSchema, TDynamicProviderFns } from "./models";

// destroy client requires callback...
const noop = () => {};

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = () => `infisical_${alphaNumericNanoId(32)}`; // username must start with alpha character, hence prefix
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

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSnowflakeSchema>) => {
    const client = snowflake.createConnection({
      account: `${providerInputs.orgId}-${providerInputs.accountId}`,
      username: providerInputs.username,
      password: providerInputs.password,
      application: "Infisical"
    });

    await client.connectAsync(noop);

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    let isValidConnection: boolean;

    try {
      isValidConnection = await Promise.race([
        client.isValidAsync(),
        new Promise((resolve) => {
          setTimeout(resolve, 10000);
        }).then(() => {
          throw new BadRequestError({ message: "Unable to establish connection - verify credentials" });
        })
      ]);
    } finally {
      client.destroy(noop);
    }

    return isValidConnection;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);

    const client = await $getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();

    try {
      const expiration = getDaysToExpiry(new Date(expireAt));
      const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
        username,
        password,
        expiration
      });

      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: creationStatement,
          complete(err) {
            if (err) {
              return reject(new BadRequestError({ name: "CreateLease", message: err.message }));
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

    const client = await $getClient(providerInputs);

    try {
      const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });

      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: revokeStatement,
          complete(err) {
            if (err) {
              return reject(new BadRequestError({ name: "RevokeLease", message: err.message }));
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

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const client = await $getClient(providerInputs);

    try {
      const expiration = getDaysToExpiry(new Date(expireAt));
      const renewStatement = handlebars.compile(providerInputs.renewStatement)({
        username: entityId,
        expiration
      });

      await new Promise((resolve, reject) => {
        client.execute({
          sqlText: renewStatement,
          complete(err) {
            if (err) {
              return reject(new BadRequestError({ name: "RenewLease", message: err.message }));
            }

            return resolve(true);
          }
        });
      });
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
