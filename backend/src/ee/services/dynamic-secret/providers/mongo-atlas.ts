import axios, { AxiosError } from "axios";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { createDigestAuthRequestInterceptor } from "@app/lib/axios/digest-auth";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretMongoAtlasSchema, TDynamicProviderFns } from "./models";
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

export const MongoAtlasProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretMongoAtlasSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretMongoAtlasSchema>) => {
    const client = axios.create({
      baseURL: "https://cloud.mongodb.com/api/atlas",
      headers: {
        Accept: "application/vnd.atlas.2023-02-01+json",
        "Content-Type": "application/json"
      }
    });
    const digestAuth = createDigestAuthRequestInterceptor(
      client,
      providerInputs.adminPublicKey,
      providerInputs.adminPrivateKey
    );
    return digestAuth;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const isConnected = await client({
      method: "GET",
      url: `v2/groups/${providerInputs.groupId}/databaseUsers`,
      params: { itemsPerPage: 1 }
    })
      .then(() => true)
      .catch((error) => {
        if ((error as AxiosError).response) {
          throw new Error(JSON.stringify((error as AxiosError).response?.data));
        }
        throw error;
      });
    return isConnected;
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity?: { name: string };
  }) => {
    const { inputs, expireAt, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = generateUsername(usernameTemplate, identity);
    const password = generatePassword();
    const expiration = new Date(expireAt).toISOString();
    await client({
      method: "POST",
      url: `/v2/groups/${providerInputs.groupId}/databaseUsers`,
      data: {
        roles: providerInputs.roles,
        scopes: providerInputs.scopes,
        deleteAfterDate: expiration,
        username,
        password,
        databaseName: "admin",
        groupId: providerInputs.groupId
      }
    }).catch((error) => {
      if ((error as AxiosError).response) {
        throw new Error(JSON.stringify((error as AxiosError).response?.data));
      }
      throw error;
    });
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;
    const isExisting = await client({
      method: "GET",
      url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`
    }).catch((err) => {
      if ((err as AxiosError).response?.status === 404) return false;
      throw err;
    });
    if (isExisting) {
      await client({
        method: "DELETE",
        url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`
      }).catch((error) => {
        if ((error as AxiosError).response) {
          throw new Error(JSON.stringify((error as AxiosError).response?.data));
        }
        throw error;
      });
    }

    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;
    const expiration = new Date(expireAt).toISOString();

    await client({
      method: "PATCH",
      url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`,
      data: {
        deleteAfterDate: expiration,
        databaseName: "admin",
        groupId: providerInputs.groupId
      }
    }).catch((error) => {
      if ((error as AxiosError).response) {
        throw new Error(JSON.stringify((error as AxiosError).response?.data));
      }
      throw error;
    });
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
