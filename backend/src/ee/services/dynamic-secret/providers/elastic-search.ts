import { Client as ElasticSearchClient } from "@elastic/elasticsearch";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretElasticSearchSchema, ElasticSearchAuthTypes, TDynamicProviderFns } from "./models";
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

export const ElasticSearchProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretElasticSearchSchema.parseAsync(inputs);
    const [hostIp] = await verifyHostInputValidity(providerInputs.host);
    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretElasticSearchSchema> & { hostIp: string }) => {
    const connection = new ElasticSearchClient({
      node: {
        url: new URL(`${providerInputs.hostIp}:${providerInputs.port}`),
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

    const infoResponse = await connection
      .info()
      .then(() => true)
      .catch(() => false);

    return infoResponse;
  };

  const create = async (data: { inputs: unknown; usernameTemplate?: string | null; identity?: { name: string } }) => {
    const { inputs, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    const username = generateUsername(usernameTemplate, identity);
    const password = generatePassword();

    await connection.security.putUser({
      username,
      password,
      full_name: "Managed by Infisical.com",
      roles: providerInputs.roles
    });

    await connection.close();
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    await connection.security.deleteUser({
      username: entityId
    });

    await connection.close();
    return { entityId };
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
