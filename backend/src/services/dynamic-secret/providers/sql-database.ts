import handlebars from "handlebars";
import knex from "knex";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getDbConnectionHost } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretSqlDBSchema, TDynamicProviderFns } from "./models";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const generatePassword = (size?: number) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*'$#";
  return customAlphabet(charset, 32)(size);
};

export const SqlDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const appCfg = getConfig();
    const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);

    const providerInputs = await DynamicSecretSqlDBSchema.parseAsync(inputs);
    if (providerInputs.host === "localhost" || providerInputs.host === "127.0.0.1" || dbHost === providerInputs.host)
      throw new BadRequestError({ message: "Invalid db host" });
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
        connectionTimeoutMillis: EXTERNAL_REQUEST_TIMEOUT,
        ssl,
        pool: { min: 0, max: 1 }
      }
    });
    return db;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);
    const isConnected = await db
      .raw("SELECT NOW()")
      .then(() => true)
      .catch(() => false);
    await db.destroy();
    return isConnected;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = alphaNumericNanoId(21);
    const password = generatePassword();
    const expiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password: "infisical",
      expiration
    });

    await db.raw(creationStatement.toString());
    await db.destroy();
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = entityId;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    await db.raw(revokeStatement);

    await db.destroy();
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const db = await getClient(providerInputs);

    const username = entityId;
    const expiration = new Date(expireAt).toISOString();

    const renewStatement = handlebars.compile(providerInputs.renewStatement)({ username, expiration });
    await db.raw(renewStatement);

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
