/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import handlebars from "handlebars";
import hdb from "hdb";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSapHanaSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return customAlphabet(charset, 48)(size);
};

export const SapHanaProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSapHanaSchema.parseAsync(inputs);

    await verifyHostInputValidity({ host: providerInputs.host, isDynamicSecret: true });
    validateHandlebarTemplate("SAP Hana creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration"].includes(val)
    });
    if (providerInputs.renewStatement) {
      validateHandlebarTemplate("SAP Hana renew", providerInputs.renewStatement, {
        allowedExpressions: (val) => ["username", "expiration"].includes(val)
      });
    }
    validateHandlebarTemplate("SAP Hana revoke", providerInputs.revocationStatement, {
      allowedExpressions: (val) => ["username"].includes(val)
    });
    return { ...providerInputs };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSapHanaSchema>) => {
    const client = hdb.createClient({
      host: providerInputs.host,
      port: providerInputs.port,
      user: providerInputs.username,
      password: providerInputs.password,
      ...(providerInputs.ca
        ? {
            ca: providerInputs.ca
          }
        : {})
    });

    await new Promise((resolve, reject) => {
      client.connect((err: any) => {
        if (err) {
          return reject(err);
        }

        if (client.readyState) {
          return resolve(true);
        }

        reject(new Error("SAP HANA client not ready"));
      });
    });

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    try {
      const client = await $getClient(providerInputs);
      const testResult = await new Promise<boolean>((resolve, reject) => {
        client.exec("SELECT 1 FROM DUMMY;", (err: any) => {
          if (err) {
            return reject(err);
          }
          resolve(true);
        });
      });
      return testResult;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.password, providerInputs.username, providerInputs.host]
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

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });
    const password = generatePassword();
    const expiration = new Date(expireAt).toISOString();

    const client = await $getClient(providerInputs);
    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration
    });

    const queries = creationStatement.toString().split(";").filter(Boolean);
    try {
      for await (const query of queries) {
        await new Promise((resolve, reject) => {
          client.exec(query, (err: any) => {
            if (err) return reject(err);
            resolve(true);
          });
        });
      }
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, password, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);
    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    const queries = revokeStatement.toString().split(";").filter(Boolean);
    try {
      for await (const query of queries) {
        await new Promise((resolve, reject) => {
          client.exec(query, (err: any) => {
            if (err) {
              reject(err);
            }
            resolve(true);
          });
        });
      }
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [username, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }

    return { entityId: username };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!providerInputs.renewStatement) return { entityId };

    const client = await $getClient(providerInputs);
    try {
      const expiration = new Date(expireAt).toISOString();

      const renewStatement = handlebars.compile(providerInputs.renewStatement)({ username: entityId, expiration });
      const queries = renewStatement.toString().split(";").filter(Boolean);
      for await (const query of queries) {
        await new Promise((resolve, reject) => {
          client.exec(query, (err: any) => {
            if (err) {
              reject(err);
            }
            resolve(true);
          });
        });
      }
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [entityId, providerInputs.password, providerInputs.username]
      });
      throw new BadRequestError({
        message: `Failed to renew lease from provider: ${sanitizedErrorMessage}`
      });
    } finally {
      client.disconnect();
    }

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
