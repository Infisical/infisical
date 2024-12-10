import cassandra from "cassandra-driver";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretCassandraSchema, TDynamicProviderFns } from "./models";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

export const CassandraProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretCassandraSchema.parseAsync(inputs);
    if (providerInputs.host === "localhost" || providerInputs.host === "127.0.0.1") {
      throw new BadRequestError({ message: "Invalid db host" });
    }

    return providerInputs;
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
      contactPoints: providerInputs.host.split(",").filter(Boolean)
    });
    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const isConnected = await client.execute("SELECT * FROM system_schema.keyspaces").then(() => true);
    await client.shutdown();
    return isConnected;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();
    const { keyspace } = providerInputs;
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
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;
    const { keyspace } = providerInputs;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username, keyspace });
    const queries = revokeStatement.toString().split(";").filter(Boolean);
    for (const query of queries) {
      // eslint-disable-next-line
      await client.execute(query);
    }
    await client.shutdown();
    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const client = await $getClient(providerInputs);

    const expiration = new Date(expireAt).toISOString();
    const { keyspace } = providerInputs;

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
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
