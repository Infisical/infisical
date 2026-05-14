import https from "node:https";

import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretMilvusSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

type TMilvusProviderInputs = z.infer<typeof DynamicSecretMilvusSchema>;

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!@*";
  return customAlphabet(charset, 32)();
};

const buildBaseUrl = (host: string, port: number) => {
  const hasScheme = host.startsWith("http://") || host.startsWith("https://");
  const normalized = hasScheme ? host : `http://${host}`;
  return `${normalized}:${port}`;
};

const deriveRoleName = (username: string) => `infisical_role_${username}`;

export const MilvusProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: object) => {
    const providerInputs = await DynamicSecretMilvusSchema.parseAsync(inputs);
    const { hostname } = new URL(buildBaseUrl(providerInputs.host, providerInputs.port));
    await verifyHostInputValidity({ host: hostname, isDynamicSecret: true });
    return providerInputs;
  };

  const $requestConfig = (providerInputs: TMilvusProviderInputs) => ({
    baseURL: buildBaseUrl(providerInputs.host, providerInputs.port),
    headers: {
      Authorization: `Bearer ${providerInputs.username}:${providerInputs.password}`,
      "Content-Type": "application/json"
    },
    timeout: 30000,
    maxRedirects: 0,
    ...(providerInputs.ca && {
      httpsAgent: new https.Agent({
        ca: providerInputs.ca,
        rejectUnauthorized: providerInputs.sslRejectUnauthorized
      })
    })
  });

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs as object);
    try {
      await request.post(
        "/v2/vectordb/users/describe",
        { userName: providerInputs.username },
        $requestConfig(providerInputs)
      );
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.username, providerInputs.password, providerInputs.host]
      });
      throw new BadRequestError({ message: `Failed to connect with Milvus: ${sanitizedErrorMessage}` });
    }
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs as object);
    const requestConfig = $requestConfig(providerInputs);

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });
    const password = generatePassword();
    const roleName = deriveRoleName(username);

    let userCreated = false;
    let roleCreated = false;

    try {
      await request.post("/v2/vectordb/users/create", { userName: username, password }, requestConfig);
      userCreated = true;

      if (providerInputs.privileges.length > 0) {
        await request.post("/v2/vectordb/roles/create", { roleName }, requestConfig);
        roleCreated = true;

        await Promise.all(
          providerInputs.privileges.map((privilege) =>
            request.post(
              "/v2/vectordb/roles/grant_privilege_v2",
              {
                roleName,
                objectType: privilege.objectType,
                collectionName: privilege.objectName,
                privilege: privilege.privilege,
                dbName: privilege.dbName ?? providerInputs.database
              },
              requestConfig
            )
          )
        );

        await request.post("/v2/vectordb/users/grant_role", { userName: username, roleName }, requestConfig);
      }

      return {
        entityId: username,
        data: { DB_USERNAME: username, DB_PASSWORD: password }
      };
    } catch (err) {
      if (roleCreated) {
        try {
          await request.post("/v2/vectordb/roles/drop", { roleName }, requestConfig);
        } catch (cleanupErr) {
          logger.error(cleanupErr, `Failed to cleanup Milvus role [roleName=${roleName}]`);
        }
      }
      if (userCreated) {
        try {
          await request.post("/v2/vectordb/users/drop", { userName: username }, requestConfig);
        } catch (cleanupErr) {
          logger.error(cleanupErr, `Failed to cleanup Milvus user [userName=${username}]`);
        }
      }

      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, password, providerInputs.username, providerInputs.password, providerInputs.host]
      });
      throw new BadRequestError({ message: `Failed to create Milvus lease: ${sanitizedErrorMessage}` });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs as object);
    const requestConfig = $requestConfig(providerInputs);
    const username = entityId;
    const roleName = deriveRoleName(username);

    try {
      try {
        await request.post("/v2/vectordb/users/revoke_role", { userName: username, roleName }, requestConfig);
      } catch (err) {
        logger.error(err, `Failed to revoke Milvus role from user [userName=${username}] [roleName=${roleName}]`);
      }
      try {
        await request.post("/v2/vectordb/roles/drop", { roleName }, requestConfig);
      } catch (err) {
        logger.error(err, `Failed to drop Milvus role [roleName=${roleName}]`);
      }

      await request.post("/v2/vectordb/users/drop", { userName: username }, requestConfig);
      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, providerInputs.username, providerInputs.password, providerInputs.host]
      });
      throw new BadRequestError({ message: `Failed to revoke Milvus lease: ${sanitizedErrorMessage}` });
    }
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
