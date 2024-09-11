import { Client as ElasticSearchClient } from "@elastic/elasticsearch";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretElasticSearchSchema, ElasticSearchAuthTypes, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

export const ElasticSearchProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const appCfg = getConfig();
    const isCloud = Boolean(appCfg.LICENSE_SERVER_KEY); // quick and dirty way to check if its cloud or not

    const providerInputs = await DynamicSecretElasticSearchSchema.parseAsync(inputs);
    if (
      isCloud &&
      // localhost
      // internal ips
      (providerInputs.host === "host.docker.internal" ||
        providerInputs.host.match(/^10\.\d+\.\d+\.\d+/) ||
        providerInputs.host.match(/^192\.168\.\d+\.\d+/))
    ) {
      throw new BadRequestError({ message: "Invalid db host" });
    }
    if (providerInputs.host === "localhost" || providerInputs.host === "127.0.0.1") {
      throw new BadRequestError({ message: "Invalid db host" });
    }

    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretElasticSearchSchema>) => {
    const connection = new ElasticSearchClient({
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
    const connection = await getClient(providerInputs);

    const infoResponse = await connection
      .info()
      .then(() => true)
      .catch(() => false);

    return infoResponse;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = generateUsername();
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
    const connection = await getClient(providerInputs);

    await connection.security.deleteUser({
      username: entityId
    });

    await connection.close();
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string) => {
    // Do nothing
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
