import { MongoClient } from "mongodb";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretMongoDBSchema, TDynamicProviderFns } from "./models";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

export const MongoDBProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const appCfg = getConfig();
    const providerInputs = await DynamicSecretMongoDBSchema.parseAsync(inputs);
    if (
      appCfg.isCloud &&
      // localhost
      // internal ips
      (providerInputs.host === "host.docker.internal" ||
        providerInputs.host.match(/^10\.\d+\.\d+\.\d+/) ||
        providerInputs.host.match(/^192\.168\.\d+\.\d+/))
    )
      throw new BadRequestError({ message: "Invalid db host" });

    if (providerInputs.host === "localhost" || providerInputs.host === "127.0.0.1") {
      throw new BadRequestError({ message: "Invalid db host" });
    }

    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretMongoDBSchema>) => {
    const isSrv = !providerInputs.port;
    const uri = isSrv
      ? `mongodb+srv://${providerInputs.host}`
      : `mongodb://${providerInputs.host}:${providerInputs.port}`;

    const client = new MongoClient(uri, {
      auth: {
        username: providerInputs.username,
        password: providerInputs.password
      },
      directConnection: !isSrv,
      ca: providerInputs.ca
    });
    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await getClient(providerInputs);

    const isConnected = await client
      .db(providerInputs.database)
      .command({ ping: 1 })
      .then(() => true);

    await client.close();
    return isConnected;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();

    const db = client.db(providerInputs.database);

    await db.command({
      createUser: username,
      pwd: password,
      roles: providerInputs.roles
    });
    await client.close();

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await getClient(providerInputs);

    const username = entityId;

    const db = client.db(providerInputs.database);
    await db.command({
      dropUser: username
    });
    await client.close();

    return { entityId: username };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
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
