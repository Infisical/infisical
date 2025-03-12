import axios, { Axios } from "axios";
import https from "https";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretRabbitMqSchema, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

const generateUsername = () => alphaNumericNanoId(32);

type TCreateRabbitMQUser = {
  axiosInstance: Axios;
  createUser: {
    username: string;
    password: string;
    tags: string[];
  };
  virtualHost: {
    name: string;
    permissions: {
      read: string;
      write: string;
      configure: string;
    };
  };
};

type TDeleteRabbitMqUser = {
  axiosInstance: Axios;
  usernameToDelete: string;
};

async function createRabbitMqUser({ axiosInstance, createUser, virtualHost }: TCreateRabbitMQUser): Promise<void> {
  try {
    // Create user
    const userUrl = `/users/${createUser.username}`;
    const userData = {
      password: createUser.password,
      tags: createUser.tags.join(",")
    };

    await axiosInstance.put(userUrl, userData);

    // Set permissions for the virtual host
    if (virtualHost) {
      const permissionData = {
        configure: virtualHost.permissions.configure,
        write: virtualHost.permissions.write,
        read: virtualHost.permissions.read
      };

      await axiosInstance.put(
        `/permissions/${encodeURIComponent(virtualHost.name)}/${createUser.username}`,
        permissionData
      );
    }
  } catch (error) {
    logger.error(error, "Error creating RabbitMQ user");
    throw error;
  }
}

async function deleteRabbitMqUser({ axiosInstance, usernameToDelete }: TDeleteRabbitMqUser) {
  await axiosInstance.delete(`users/${usernameToDelete}`);
  return { username: usernameToDelete };
}

export const RabbitMqProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretRabbitMqSchema.parseAsync(inputs);
    verifyHostInputValidity(providerInputs.host);

    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretRabbitMqSchema>) => {
    const axiosInstance = axios.create({
      baseURL: `${removeTrailingSlash(providerInputs.host)}:${providerInputs.port}/api`,
      auth: {
        username: providerInputs.username,
        password: providerInputs.password
      },
      headers: {
        "Content-Type": "application/json"
      },

      ...(providerInputs.ca && {
        httpsAgent: new https.Agent({ ca: providerInputs.ca, rejectUnauthorized: false })
      })
    });

    return axiosInstance;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    const infoResponse = await connection.get("/whoami").then(() => true);

    return infoResponse;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();

    await createRabbitMqUser({
      axiosInstance: connection,
      virtualHost: providerInputs.virtualHost,
      createUser: {
        password,
        username,
        tags: [...(providerInputs.tags ?? []), "infisical-user"]
      }
    });

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await $getClient(providerInputs);

    await deleteRabbitMqUser({ axiosInstance: connection, usernameToDelete: entityId });

    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) =>
    // No renewal necessary
    ({ entityId });
  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
