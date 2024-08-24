/* eslint-disable no-console */
import handlebars from "handlebars";
import { Redis } from "ioredis";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { CreateElastiCacheUserSchema, ElastiCacheConnector, ElastiCacheUserManager } from "@app/lib/aws";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getDbConnectionHost } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretRedisDBSchema, RedisProviders, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const generateUsername = (provider: RedisProviders) => {
  if (provider === RedisProviders.Elasticache) {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-";
    return `inf-${customAlphabet(charset, 32)()}`; // Username must start with an ascii letter, so we prepend the username with "inf-"
  }

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
    const dbHost = appCfg.REDIS_URL || getDbConnectionHost(appCfg.REDIS_URL);

    const providerInputs = DynamicSecretRedisDBSchema.parse(inputs);

    if (providerInputs.client === RedisProviders.Elasticache) {
      JSON.parse(providerInputs.creationStatement);
      JSON.parse(providerInputs.revocationStatement);
      if (providerInputs.renewStatement) {
        JSON.parse(providerInputs.renewStatement);
      }

      if (!providerInputs.elastiCacheRegion) {
        throw new BadRequestError({ message: "elastiCacheRegion is required when client is ElastiCache" });
      }
    }

    if (
      isCloud &&
      // localhost
      // internal ips
      (providerInputs.host === "host.docker.internal" ||
        providerInputs.host.match(/^10\.\d+\.\d+\.\d+/) ||
        providerInputs.host.match(/^192\.168\.\d+\.\d+/))
    )
      throw new BadRequestError({ message: "Invalid db host" });
    if (providerInputs.host === "localhost" || dbHost === providerInputs.host)
      throw new BadRequestError({ message: "Invalid db host" });
    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretRedisDBSchema>) => {
    let connection: Redis | null = null;

    try {
      if (providerInputs.client === RedisProviders.Elasticache) {
        const connectionUri = await ElastiCacheConnector(
          {
            host: providerInputs.host,
            port: providerInputs.port,
            userId: providerInputs.elastiCacheIamUsername!
          },
          {
            accessKeyId: providerInputs.username,
            secretAccessKey: providerInputs.password!
          },
          providerInputs.elastiCacheRegion!
        ).createConnectionUri();

        connection = new Redis(connectionUri, {
          ...(providerInputs.ca && {
            tls: {
              rejectUnauthorized: false,
              ca: providerInputs.ca
            }
          })
        });
      } else if (providerInputs.client === RedisProviders.Redis) {
        connection = new Redis({
          username: providerInputs.username,
          host: providerInputs.host,
          port: providerInputs.port,
          password: providerInputs.password || undefined,
          ...(providerInputs.ca && {
            tls: {
              rejectUnauthorized: false,
              ca: providerInputs.ca
            }
          })
        });
      }

      if (connection === null) {
        throw new BadRequestError({ message: "Failed to obtain a valid Redis client" });
      }

      let result: string;
      if (providerInputs.password && providerInputs.client === RedisProviders.Redis) {
        result = await connection.auth(providerInputs.username, providerInputs.password, () => {});
        if (result !== "OK") {
          throw new BadRequestError({ message: `Invalid credentials, Redis returned ${result} status` });
        }
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
    console.log(inputs);
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const leaseUsername = generateUsername(providerInputs.client);
    const leasePassword = generatePassword();
    const leaseExpiration = new Date(expireAt).toISOString();

    if (providerInputs.client === RedisProviders.Redis) {
      const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
        username: leaseUsername,
        password: leasePassword,
        expiration: leaseExpiration
      });
      const queries = creationStatement.toString().split(";").filter(Boolean);

      await executeTransactions(connection, queries);

      await connection.quit();
      return { entityId: leaseUsername, data: { DB_USERNAME: leaseUsername, DB_PASSWORD: leasePassword } };
    }
    if (providerInputs.client === RedisProviders.Elasticache) {
      const parsedCreationData = CreateElastiCacheUserSchema.parse(JSON.parse(providerInputs.creationStatement));

      await ElastiCacheUserManager(
        {
          accessKeyId: providerInputs.username,
          secretAccessKey: providerInputs.password!
        },
        providerInputs.elastiCacheRegion!
      ).createUser({
        AccessString: parsedCreationData.AccessString,
        Engine: parsedCreationData.Engine,
        UserId: leaseUsername,
        UserName: leaseUsername,
        Passwords: [leasePassword]
      });

      return {
        entityId: leaseUsername,
        data: {
          DB_USERNAME: leaseUsername,
          DB_PASSWORD: leasePassword
        }
      };
    }

    throw new BadRequestError({ message: "Invalid client type" });
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
