import handlebars from "handlebars";
import knex from "knex";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSqlDBSchema, SqlProviders, TDynamicProviderFns } from "./models";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const generatePassword = (provider: SqlProviders) => {
  // oracle has limit of 48 password length
  const size = provider === SqlProviders.Oracle ? 30 : 48;

  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = (provider: SqlProviders) => {
  // For oracle, the client assumes everything is upper case when not using quotes around the password
  if (provider === SqlProviders.Oracle) return alphaNumericNanoId(32).toUpperCase();

  return alphaNumericNanoId(32);
};

export const SqlDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSqlDBSchema.parseAsync(inputs);
    verifyHostInputValidity(providerInputs.host);
    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretSqlDBSchema>) => {
    const ssl = providerInputs.ca ? { rejectUnauthorized: false, ca: providerInputs.ca } : undefined;
    const db = knex({
      client: providerInputs.client,
      connection: {
        database: providerInputs.database,
        port: providerInputs.port,
        host: providerInputs.host,
        user: providerInputs.username,
        password: providerInputs.password,
        ssl,
        pool: { min: 0, max: 1 }
      },
      acquireConnectionTimeout: EXTERNAL_REQUEST_TIMEOUT
    });
    return db;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);
    // oracle needs from keyword
    const testStatement = providerInputs.client === SqlProviders.Oracle ? "SELECT 1 FROM DUAL" : "SELECT 1";

    const isConnected = await db.raw(testStatement).then(() => true);
    await db.destroy();
    return isConnected;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = generateUsername(providerInputs.client);
    const password = generatePassword(providerInputs.client);
    const { database } = providerInputs;
    const expiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration,
      database
    });

    const queries = creationStatement.toString().split(";").filter(Boolean);
    await db.transaction(async (tx) => {
      for (const query of queries) {
        // eslint-disable-next-line
        await tx.raw(query);
      }
    });
    await db.destroy();
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = entityId;
    const { database } = providerInputs;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username, database });
    const queries = revokeStatement.toString().split(";").filter(Boolean);
    await db.transaction(async (tx) => {
      for (const query of queries) {
        // eslint-disable-next-line
        await tx.raw(query);
      }
    });

    await db.destroy();
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = entityId;
    const expiration = new Date(expireAt).toISOString();
    const { database } = providerInputs;

    const renewStatement = handlebars.compile(providerInputs.renewStatement)({ username, expiration, database });
    if (renewStatement) {
      const queries = renewStatement.toString().split(";").filter(Boolean);
      await db.transaction(async (tx) => {
        for (const query of queries) {
          // eslint-disable-next-line
          await tx.raw(query);
        }
      });
    }

    await db.destroy();
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
