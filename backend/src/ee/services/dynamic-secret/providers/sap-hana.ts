/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import handlebars from "handlebars";
import hdb from "hdb";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretSapHanaSchema, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

const generatePassword = (size = 48) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return customAlphabet(charset, 48)(size);
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

export const SapHanaProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretSapHanaSchema.parseAsync(inputs);

    const [hostIp] = await verifyHostInputValidity(providerInputs.host);
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
    return { ...providerInputs, hostIp };
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretSapHanaSchema> & { hostIp: string }) => {
    const client = hdb.createClient({
      host: providerInputs.hostIp,
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
    const client = await $getClient(providerInputs);

    const testResult = await new Promise<boolean>((resolve, reject) => {
      client.exec("SELECT 1 FROM DUMMY;", (err: any) => {
        if (err) {
          reject();
        }

        resolve(true);
      });
    });

    return testResult;
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity?: { name: string };
  }) => {
    const { inputs, expireAt, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const username = generateUsername(usernameTemplate, identity);
    const password = generatePassword();
    const expiration = new Date(expireAt).toISOString();

    const client = await $getClient(providerInputs);
    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration
    });

    const queries = creationStatement.toString().split(";").filter(Boolean);
    for await (const query of queries) {
      await new Promise((resolve, reject) => {
        client.exec(query, (err: any) => {
          if (err) {
            reject(
              new BadRequestError({
                message: err.message
              })
            );
          }
          resolve(true);
        });
      });
    }

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, username: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);
    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    const queries = revokeStatement.toString().split(";").filter(Boolean);
    for await (const query of queries) {
      await new Promise((resolve, reject) => {
        client.exec(query, (err: any) => {
          if (err) {
            reject(
              new BadRequestError({
                message: err.message
              })
            );
          }
          resolve(true);
        });
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
              reject(
                new BadRequestError({
                  message: err.message
                })
              );
            }
            resolve(true);
          });
        });
      }
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
