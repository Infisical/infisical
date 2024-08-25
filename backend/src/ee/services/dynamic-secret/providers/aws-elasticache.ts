import handlebars from "handlebars";
import { customAlphabet } from "nanoid";

import { CreateElastiCacheUserSchema, DeleteElasticCacheUserSchema, ElastiCacheUserManager } from "@app/lib/aws";
import { BadRequestError } from "@app/lib/errors";

import { DynamicSecretAwsElastiCacheSchema, TDynamicProviderFns } from "./models";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const generateUsername = () => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-";
  return `inf-${customAlphabet(charset, 32)()}`; // Username must start with an ascii letter, so we prepend the username with "inf-"
};

export const AwsElastiCacheDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = DynamicSecretAwsElastiCacheSchema.parse(inputs);

    JSON.parse(providerInputs.creationStatement);
    JSON.parse(providerInputs.revocationStatement);

    return providerInputs;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    await ElastiCacheUserManager(
      {
        accessKeyId: providerInputs.accessKeyId,
        secretAccessKey: providerInputs.secretAccessKey
      },
      providerInputs.region
    ).verifyCredentials(providerInputs.clusterName);
    return true;
  };

  const create = async (inputs: unknown, expireAt: number) => {
    const providerInputs = await validateProviderInputs(inputs);
    if (!(await validateConnection(providerInputs))) {
      throw new BadRequestError({ message: "Failed to establish connection" });
    }

    const leaseUsername = generateUsername();
    const leasePassword = generatePassword();
    const leaseExpiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username: leaseUsername,
      password: leasePassword,
      expiration: leaseExpiration
    });

    const parsedStatement = CreateElastiCacheUserSchema.parse(JSON.parse(creationStatement));

    await ElastiCacheUserManager(
      {
        accessKeyId: providerInputs.accessKeyId,
        secretAccessKey: providerInputs.secretAccessKey
      },
      providerInputs.region
    ).createUser(parsedStatement, providerInputs.clusterName);

    return {
      entityId: leaseUsername,
      data: {
        DB_USERNAME: leaseUsername,
        DB_PASSWORD: leasePassword
      }
    };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement)({ username: entityId });
    const parsedStatement = DeleteElasticCacheUserSchema.parse(JSON.parse(revokeStatement));

    await ElastiCacheUserManager(
      {
        accessKeyId: providerInputs.accessKeyId,
        secretAccessKey: providerInputs.secretAccessKey
      },
      providerInputs.region
    ).deleteUser(parsedStatement);

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
