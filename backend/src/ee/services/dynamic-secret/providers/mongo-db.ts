import { MongoClient } from "mongodb";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretMongoDBSchema, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

const generateUsername = (usernameTemplate?: string | null, identity?: { name: string }) => {
  const randomUsername = alphaNumericNanoId(32);
  if (!usernameTemplate) return randomUsername;
  return compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity
  });
};

export const MongoDBProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretMongoDBSchema.parseAsync(inputs);
    const [hostIp] = await verifyHostInputValidity(providerInputs.host);
    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretMongoDBSchema> & { hostIp: string }) => {
    const isSrv = !providerInputs.port;
    const uri = isSrv
      ? `mongodb+srv://${providerInputs.hostIp}`
      : `mongodb://${providerInputs.hostIp}:${providerInputs.port}`;

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
    const client = await $getClient(providerInputs);

    const isConnected = await client
      .db(providerInputs.database)
      .command({ ping: 1 })
      .then(() => true);

    await client.close();
    return isConnected;
  };

  const create = async (data: { inputs: unknown; usernameTemplate?: string | null; identity?: { name: string } }) => {
    const { inputs, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = generateUsername(usernameTemplate, identity);
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
    const client = await $getClient(providerInputs);

    const username = entityId;

    const db = client.db(providerInputs.database);
    await db.command({
      dropUser: username
    });
    await client.close();

    return { entityId: username };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // No renewal necessary
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
