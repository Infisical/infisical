import handlebars from "handlebars";
import { Redis } from "ioredis";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretRedisDBSchema, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

const generateUsername = (usernameTemplate?: string | null, identity?: { name: string }) => {
  const randomUsername = alphaNumericNanoId(32); // Username must start with an ascii letter, so we prepend the username with "inf-"
  if (!usernameTemplate) return randomUsername;
  return compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity
  });
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
    const providerInputs = await DynamicSecretRedisDBSchema.parseAsync(inputs);
    const [hostIp] = await verifyHostInputValidity(providerInputs.host);
    validateHandlebarTemplate("Redis creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration"].includes(val)
    });
    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("Redis renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration"].includes(val)
      });
    }
    validateHandlebarTemplate("Redis revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username"].includes(val)
    });

    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretRedisDBSchema> & { hostIp: string }) => {
    let connection: Redis | null = null;
    try {
      connection = new Redis({
        username: providerInputs.username,
        host: providerInputs.hostIp,
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
    const connection = await $getClient(providerInputs);

    const pingResponse = await connection
      .ping()
      .then(() => true)
      .catch(() => false);

    return pingResponse;
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity?: { name: string };
  }) => {
    const { inputs, expireAt, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    const username = generateUsername(usernameTemplate, identity);
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
    const connection = await $getClient(providerInputs);

    const username = entityId;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    const queries = revokeStatement.toString().split(";").filter(Boolean);

    await executeTransactions(connection, queries);

    await connection.quit();
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const connection = await $getClient(providerInputs);

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
