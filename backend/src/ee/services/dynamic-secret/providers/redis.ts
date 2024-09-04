import handlebars from "handlebars";
import { Redis } from "ioredis";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getDbConnectionHost } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretRedisDBSchema, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

const executeTransactions = async (connection: Redis, commands: string[]): Promise<(string | null)[] | null> => {
  // Initiate a transaction
  const pipeline = connection.multi();

  // Add all commands to the pipeline
  for (const command of commands) {
    const args = command
      .split(" ")
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0);
    pipeline.call(args[0], ...args.slice(1));
  }

  // Execute the transaction
  const results = await pipeline.exec();

  if (!results) {
    throw new BadRequestError({ message: "Redis transaction failed: No results returned" });
  }

  // Check for errors in the results
  const errors = results.filter(([err]) => err !== null);
  if (errors.length > 0) {
    throw new BadRequestError({ message: "Redis transaction failed with errors" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return results.map(([_, result]) => result as string | null);
};

export const RedisDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const appCfg = getConfig();
    const isCloud = Boolean(appCfg.LICENSE_SERVER_KEY); // quick and dirty way to check if its cloud or not
    const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);

    const providerInputs = await DynamicSecretRedisDBSchema.parseAsync(inputs);
    if (
      isCloud &&
      // localhost
      // internal ips
      (providerInputs.host === "host.docker.internal" ||
        providerInputs.host.match(/^10\.\d+\.\d+\.\d+/) ||
        providerInputs.host.match(/^192\.168\.\d+\.\d+/))
    )
      throw new BadRequestError({ message: "Invalid db host" });
    if (providerInputs.host === "localhost" || providerInputs.host === "127.0.0.1" || dbHost === providerInputs.host)
      throw new BadRequestError({ message: "Invalid db host" });
    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretRedisDBSchema>) => {
    let connection: Redis | null = null;
    try {
      connection = new Redis({
        username: providerInputs.username,
        host: providerInputs.host,
        port: providerInputs.port,
        password: providerInputs.password,
        ...(providerInputs.ca && {
          tls: {
            rejectUnauthorized: false,
            ca: providerInputs.ca
          }
        })
      });

      let result: string;
      if (providerInputs.password) {
        result = await connection.auth(providerInputs.username, providerInputs.password, () => {});
      } else {
        result = await connection.auth(providerInputs.username, () => {});
      }

      if (result !== "OK") {
        throw new BadRequestError({ message: `Invalid credentials, Redis returned ${result} status` });
      }

      return connection;
    } catch (err) {
      if (connection) await connection.quit();

      throw err;
    }
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const pingResponse = await connection
      .ping()
      .then(() => true)
      .catch(() => false);

    return pingResponse;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();
    const expiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration
    });

    const queries = creationStatement.toString().split(";").filter(Boolean);

    await executeTransactions(connection, queries);

    await connection.quit();
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = entityId;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    const queries = revokeStatement.toString().split(";").filter(Boolean);

    await executeTransactions(connection, queries);

    await connection.quit();
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = entityId;
    const expiration = new Date(expireAt).toISOString();

    const renewStatement = handlebars.compile(providerInputs.renewStatement)({ username, expiration });

    if (renewStatement) {
      const queries = renewStatement.toString().split(";").filter(Boolean);
      await executeTransactions(connection, queries);
    }

    await connection.quit();
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
