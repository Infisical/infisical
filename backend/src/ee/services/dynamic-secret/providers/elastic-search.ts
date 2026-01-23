import { Client as ElasticSearchClient } from "@elastic/elasticsearch";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretElasticSearchSchema, ElasticSearchAuthTypes, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

export const ElasticSearchProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretElasticSearchSchema.parseAsync(inputs);
    await verifyHostInputValidity({ host: providerInputs.host, isDynamicSecret: true });
    return { ...providerInputs };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretElasticSearchSchema>) => {
    const connection = new ElasticSearchClient({
      requestTimeout: 30_000,
      node: {
        url: new URL(`${providerInputs.host}:${providerInputs.port}`),
        ...(providerInputs.ca && {
          ssl: {
            rejectUnauthorized: false,
            ca: providerInputs.ca
          }
        })
      },
      auth: {
        ...(providerInputs.auth.type === ElasticSearchAuthTypes.ApiKey
          ? {
              apiKey: {
                api_key: providerInputs.auth.apiKey,
                id: providerInputs.auth.apiKeyId
              }
            }
          : {
              username: providerInputs.auth.username,
              password: providerInputs.auth.password
            })
      }
    });

    return connection;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    try {
      const infoResponse = await connection.info().then(() => true);
      return infoResponse;
    } catch (err) {
      const tokens = [];
      if (providerInputs.auth.type === ElasticSearchAuthTypes.ApiKey) {
        tokens.push(providerInputs.auth.apiKey, providerInputs.auth.apiKeyId);
      } else {
        tokens.push(providerInputs.auth.username, providerInputs.auth.password);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    dynamicSecret: TDynamicSecrets;
    identity: ActorIdentityAttributes;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });
    const password = generatePassword();

    try {
      await connection.security.putUser({
        username,
        password,
        full_name: "Managed by Infisical.com",
        roles: providerInputs.roles
      });

      await connection.close();
      return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, password]
      });
      await connection.close();
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    try {
      await connection.security.deleteUser({
        username: entityId
      });

      await connection.close();
      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [entityId]
      });
      await connection.close();
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
