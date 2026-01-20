import { MongoClient } from "mongodb";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretMongoDBSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
};

export const MongoDBProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretMongoDBSchema.parseAsync(inputs);
    await verifyHostInputValidity({ host: providerInputs.host });
    return { ...providerInputs };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretMongoDBSchema>) => {
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
      ca: providerInputs.ca || undefined
    });
    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    try {
      const isConnected = await client
        .db(providerInputs.database)
        .command({ ping: 1 })
        .then(() => true);

      await client.close();
      return isConnected;
    } catch (err) {
      await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.password, providerInputs.username, providerInputs.database, providerInputs.host]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    let username = "";
    let password = "";

    try {
      username = await generateUsername(usernameTemplate, {
        decryptedDynamicSecretInputs: inputs,
        dynamicSecret,
        identity
      });
      password = generatePassword();

      const db = client.db(providerInputs.database);

      await db.command({
        createUser: username,
        pwd: password,
        roles: providerInputs.roles
      });
      await client.close();

      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } catch (err) {
      await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, password, providerInputs.password, providerInputs.username, providerInputs.database]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;

    try {
      const db = client.db(providerInputs.database);
      await db.command({
        dropUser: username
      });
      await client.close();

      return { entityId: username };
    } catch (err) {
      await client.close();
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, providerInputs.password, providerInputs.username, providerInputs.database]
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }
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
