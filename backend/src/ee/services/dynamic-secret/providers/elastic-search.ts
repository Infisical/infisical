/* eslint-disable no-console */
import { Client as ElasticCacheClient } from "@elastic/elasticsearch";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretElasticSearchSchema, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

const parseJsonStatement = (str: string) => {
  try {
    return JSON.parse(str) as object;
  } catch {
    throw new BadRequestError({ message: "Failed to parse ElasticSearch statements" });
  }
};

const CreateElasticSearchUserSchema = z
  .object({
    username: z.string(),
    password: z.string().optional(),
    password_hash: z.string().optional(),

    refresh: z.any(),
    email: z.string().optional(),
    full_name: z.string().optional().default("Managed by Infisical.com"), // We are overriding this
    metadata: z.any().optional(),

    roles: z.array(z.string()).min(1), // i.e ['superuser']
    enabled: z.boolean().default(true)
  })
  .refine((data) => {
    // Ensure either password_hash or password is present
    if (!data.password && !data.password_hash) {
      throw new Error("Either password or password_hash is required");
    }
    return true;
  });

const DeleteElasticSearchUserSchema = z.object({
  username: z.string().trim().min(1)
});

export const ElasticSearchDatabaseProvider = (): TDynamicProviderFns => {
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

    if (!CreateElasticSearchUserSchema.safeParse(parseJsonStatement(providerInputs.creationStatement)).success) {
      throw new BadRequestError({ message: "Invalid creation statement" });
    }
    if (!DeleteElasticSearchUserSchema.safeParse(parseJsonStatement(providerInputs.revocationStatement)).success) {
      throw new BadRequestError({ message: "Invalid revocation statement" });
    }

    return providerInputs;
  };

  const getClient = async (providerInputs: z.infer<typeof DynamicSecretElasticSearchSchema>) => {
    const connection = new ElasticCacheClient({
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
        ...(providerInputs.auth.type === "api-key"
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

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = generateUsername();
    const password = generatePassword();

    const expiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username,
      password,
      expiration
    });

    const parsedStatement = CreateElasticSearchUserSchema.parse(parseJsonStatement(creationStatement));

    await connection.security.putUser(parsedStatement);

    await connection.close();
    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const connection = await getClient(providerInputs);

    const username = entityId;

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username });
    const parsedStatement = DeleteElasticSearchUserSchema.parse(parseJsonStatement(revokeStatement));

    await connection.security.deleteUser(parsedStatement);

    await connection.close();
    return { entityId: username };
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
