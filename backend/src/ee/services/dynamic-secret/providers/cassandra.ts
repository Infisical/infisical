import cassandra from "cassandra-driver";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretCassandraSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

export const CassandraProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretCassandraSchema.parseAsync(inputs);
    await Promise.all(
      providerInputs.host
        .split(",")
        .filter(Boolean)
        .map((el) => verifyHostInputValidity({ host: el, isDynamicSecret: true }).then((ip) => ip[0]))
    );
    validateHandlebarTemplate("Cassandra creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration", "keyspace"].includes(val)
    });
    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("Cassandra renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration", "keyspace"].includes(val)
      });
    }
    validateHandlebarTemplate("Cassandra revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username"].includes(val)
    });

    return { ...providerInputs };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretCassandraSchema>) => {
    const sslOptions = providerInputs.ca ? { rejectUnauthorized: false, ca: providerInputs.ca } : undefined;
    const client = new cassandra.Client({
      sslOptions,
      protocolOptions: {
        port: providerInputs.port
      },
      credentials: {
        username: providerInputs.username,
        password: providerInputs.password
      },
      keyspace: providerInputs.keyspace,
      localDataCenter: providerInputs?.localDataCenter,
      contactPoints: providerInputs.host.split(",")
    });
    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    try {
      const isConnected = await client.execute("SELECT * FROM system_schema.keyspaces").then(() => true);
      await client.shutdown();
      return isConnected;
    } catch (err) {
      const tokens = [providerInputs.password, providerInputs.username];
      if (providerInputs.keyspace) {
        tokens.push(providerInputs.keyspace);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens
      });
      await client.shutdown();
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
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
      identity
    });

    const password = generatePassword();
    const { keyspace } = providerInputs;

    try {
      const expiration = new Date(expireAt).toISOString();

      const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
        username,
        password,
        expiration,
        keyspace
      });

      const queries = creationStatement.toString().split(";").filter(Boolean);
      for (const query of queries) {
        // eslint-disable-next-line
        await client.execute(query);
      }
      await client.shutdown();

      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } catch (err) {
      const tokens = [username, password];
      if (keyspace) {
        tokens.push(keyspace);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens
      });
      await client.shutdown();
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;
    const { keyspace } = providerInputs;

    try {
      const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username, keyspace });
      const queries = revokeStatement.toString().split(";").filter(Boolean);
      for (const query of queries) {
        // eslint-disable-next-line
        await client.execute(query);
      }
      await client.shutdown();
      return { entityId: username };
    } catch (err) {
      const tokens = [username];
      if (keyspace) {
        tokens.push(keyspace);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens
      });
      await client.shutdown();
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const client = await $getClient(providerInputs);
    const { keyspace } = providerInputs;

    try {
      const expiration = new Date(expireAt).toISOString();

      const renewStatement = handlebars.compile(providerInputs.renewStatement)({
        username: entityId,
        keyspace,
        expiration
      });
      const queries = renewStatement.toString().split(";").filter(Boolean);
      for await (const query of queries) {
        await client.execute(query);
      }
      await client.shutdown();
      return { entityId };
    } catch (err) {
      const tokens = [entityId];
      if (keyspace) {
        tokens.push(keyspace);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens
      });
      await client.shutdown();
      throw new BadRequestError({
        message: `Failed to renew lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
