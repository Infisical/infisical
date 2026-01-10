import axios, { AxiosError } from "axios";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { createDigestAuthRequestInterceptor } from "@app/lib/axios/digest-auth";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretMongoAtlasSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 48)(size);
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

    try {
      const isConnected = await client({
        method: "GET",
        url: `v2/groups/${providerInputs.groupId}/databaseUsers`,
        params: { itemsPerPage: 1 }
      }).then(() => true);
      return isConnected;
    } catch (error) {
      const errorMessage = (error as AxiosError).response
        ? JSON.stringify((error as AxiosError).response?.data)
        : (error as Error)?.message;
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: errorMessage,
        tokens: [providerInputs.adminPublicKey, providerInputs.adminPrivateKey, providerInputs.groupId]
      });
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
    const expiration = new Date(expireAt).toISOString();
    try {
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
      });
      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } catch (error) {
      const errorMessage = (error as AxiosError).response
        ? JSON.stringify((error as AxiosError).response?.data)
        : (error as Error)?.message;
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: errorMessage,
        tokens: [
          username,
          password,
          providerInputs.adminPublicKey,
          providerInputs.adminPrivateKey,
          providerInputs.groupId
        ]
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
    const isExisting = await client({
      method: "GET",
      url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`
    }).catch((err) => {
      if ((err as AxiosError).response?.status === 404) return false;
      throw err;
    });
    if (isExisting) {
      try {
        await client({
          method: "DELETE",
          url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`
        });
      } catch (error) {
        const errorMessage = (error as AxiosError).response
          ? JSON.stringify((error as AxiosError).response?.data)
          : (error as Error)?.message;
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: errorMessage,
          tokens: [username, providerInputs.adminPublicKey, providerInputs.adminPrivateKey, providerInputs.groupId]
        });
        throw new BadRequestError({
          message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
        });
      }
    }

    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = entityId;
    const expiration = new Date(expireAt).toISOString();

    try {
      await client({
        method: "PATCH",
        url: `/v2/groups/${providerInputs.groupId}/databaseUsers/admin/${username}`,
        data: {
          deleteAfterDate: expiration,
          databaseName: "admin",
          groupId: providerInputs.groupId
        }
      });
      return { entityId: username };
    } catch (error) {
      const errorMessage = (error as AxiosError).response
        ? JSON.stringify((error as AxiosError).response?.data)
        : (error as Error)?.message;
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: errorMessage,
        tokens: [username, providerInputs.adminPublicKey, providerInputs.adminPrivateKey, providerInputs.groupId]
      });
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
