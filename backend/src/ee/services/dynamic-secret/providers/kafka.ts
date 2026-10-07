import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

import {
  AclFilter,
  AclOperations,
  AclPermissionTypes,
  alterUserScramCredentialsV0,
  apiVersionsV3,
  clientSoftwareName,
  clientSoftwareVersion,
  Connection,
  createAclsV3,
  deleteAclsV3,
  describeAclsV3,
  findErrorBy,
  ResourcePatternTypes,
  ResourceTypes,
  ScramMechanisms
} from "@platformatic/kafka";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { getTlsServerNameOptions } from "@app/lib/tls";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { DynamicSecretKafkaSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

type TKafkaProviderInputs = z.infer<typeof DynamicSecretKafkaSchema> & { hostIp: string };

const pbkdf2Async = promisify(pbkdf2);

// Kafka's minimum, and the kafka-configs.sh default
const SCRAM_ITERATIONS = 4096;

// Lease users get both credentials so clients can use whichever mechanism the broker listener enables
const SCRAM_CREDENTIALS = [
  { mechanism: ScramMechanisms.SCRAM_SHA_256, digest: "sha256", keyLength: 32 },
  { mechanism: ScramMechanisms.SCRAM_SHA_512, digest: "sha512", keyLength: 64 }
] as const;

const REQUIRED_APIS = [alterUserScramCredentialsV0.api, createAclsV3.api, deleteAclsV3.api];

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

const getPrincipalAclFilter = (username: string): AclFilter => ({
  resourceType: ResourceTypes.ANY,
  resourceName: null,
  resourcePatternType: ResourcePatternTypes.ANY,
  principal: `User:${username}`,
  host: null,
  operation: AclOperations.ANY,
  permissionType: AclPermissionTypes.ANY
});

// The library wraps the actual reason (bad credentials, TLS failure, broker error) in generic errors, as a
// cause or as the per-request errors of an aggregate
const getErrorMessage = (err: unknown): string => {
  if (err instanceof AggregateError) {
    return (err.errors as { message: string; serverErrorMessage?: string | null }[])
      .map((error) => error.serverErrorMessage || error.message)
      .join(" ");
  }
  const { message, cause } = err as Error;
  return cause ? `${message} ${getErrorMessage(cause)}` : message;
};

const deleteKafkaUser = async (connection: Connection, username: string) => {
  // ACLs go first: deleting the credential only blocks new logins, while open connections lose access with their ACLs
  await deleteAclsV3.api.async(connection, [getPrincipalAclFilter(username)]);
  // One request per credential, as Kafka requires; a credential already gone counts as deleted so that a
  // revoke retried after a partial failure, or a cleanup after a partial create, can still finish
  await Promise.all(
    SCRAM_CREDENTIALS.map(({ mechanism }) =>
      alterUserScramCredentialsV0.api.async(connection, [{ name: username, mechanism }], []).catch((err: Error) => {
        if (!findErrorBy(err, "apiId", "RESOURCE_NOT_FOUND")) throw err;
      })
    )
  );
};

export const KafkaProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretKafkaSchema.parseAsync(inputs);
    const [hostIp] = await verifyHostInputValidity({ host: providerInputs.host, isDynamicSecret: true });
    return { ...providerInputs, hostIp };
  };

  // Admin requests are accepted by any KRaft broker, so a single connection to the configured one is enough
  const $withConnection = async <T>(
    providerInputs: TKafkaProviderInputs,
    errorPrefix: string,
    callback: (connection: Connection) => Promise<T>,
    sensitiveTokens: string[] = []
  ) => {
    const connection = new Connection("infisical", {
      sasl: {
        mechanism: providerInputs.saslMechanism,
        username: providerInputs.username,
        password: providerInputs.password
      },
      ...(providerInputs.sslEnabled && {
        tls: {
          ca: providerInputs.ca || undefined,
          rejectUnauthorized: providerInputs.sslRejectUnauthorized,
          ...getTlsServerNameOptions(providerInputs.host)
        }
      })
    });

    try {
      await connection.connect(providerInputs.hostIp, providerInputs.port);
      return await callback(connection);
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: getErrorMessage(err),
        tokens: [...sensitiveTokens, providerInputs.password, providerInputs.username, providerInputs.host]
      });
      throw new BadRequestError({ message: `${errorPrefix}: ${sanitizedErrorMessage}` });
    } finally {
      await connection.close();
    }
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);

    const { isSupportedCluster, isAuthorizerEnabled } = await $withConnection(
      providerInputs,
      "Failed to connect with provider",
      async (connection) => {
        const { apiKeys, finalizedFeatures } = await apiVersionsV3.api.async(
          connection,
          clientSoftwareName,
          String(clientSoftwareVersion)
        );

        return {
          // only KRaft clusters report metadata.version, and they support managing SCRAM users from Kafka 3.5
          isSupportedCluster:
            Boolean(finalizedFeatures?.some(({ name }) => name === "metadata.version")) &&
            REQUIRED_APIS.every(({ key, version }) =>
              apiKeys.some(
                ({ apiKey, minVersion, maxVersion }) => apiKey === key && minVersion <= version && version <= maxVersion
              )
            ),
          isAuthorizerEnabled: await describeAclsV3.api
            .async(connection, getPrincipalAclFilter(providerInputs.username))
            .then(
              () => true,
              (err: Error) => {
                if (findErrorBy(err, "apiId", "SECURITY_DISABLED")) return false;
                throw err;
              }
            )
        };
      }
    );

    if (!isSupportedCluster) {
      throw new BadRequestError({
        message: "Kafka dynamic secrets require Kafka 3.5 or later running in KRaft mode."
      });
    }
    if (!isAuthorizerEnabled) {
      throw new BadRequestError({
        message:
          "ACLs are not enabled on this Kafka cluster. Set 'authorizer.class.name' on your brokers so lease users are limited to the ACLs you configure."
      });
    }
    return true;
  };

  const create = async (data: {
    inputs: unknown;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const username = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity
    });
    const password = generatePassword();
    const upsertions = await Promise.all(
      SCRAM_CREDENTIALS.map(async ({ mechanism, digest, keyLength }) => {
        const salt = randomBytes(32);
        const saltedPassword = await pbkdf2Async(password, salt, SCRAM_ITERATIONS, keyLength, digest);
        return { name: username, mechanism, iterations: SCRAM_ITERATIONS, salt, saltedPassword };
      })
    );

    await $withConnection(
      providerInputs,
      "Failed to create lease from provider",
      async (connection) => {
        try {
          // Kafka accepts one credential change per user per request
          await Promise.all(
            upsertions.map((upsertion) => alterUserScramCredentialsV0.api.async(connection, [], [upsertion]))
          );
          await createAclsV3.api.async(
            connection,
            providerInputs.acls.map((acl) => ({
              resourceType: ResourceTypes[acl.resourceType],
              resourceName: acl.resourceName,
              resourcePatternType: ResourcePatternTypes[acl.patternType],
              principal: `User:${username}`,
              host: "*",
              operation: AclOperations[acl.operation],
              permissionType: AclPermissionTypes[acl.permissionType]
            }))
          );
        } catch (err) {
          // no lease will be saved to revoke whatever was already created
          await deleteKafkaUser(connection, username).catch((cleanupErr) =>
            logger.error(cleanupErr, `Failed to clean up Kafka user [username=${username}]`)
          );
          throw err;
        }
      },
      [username, password]
    );

    return { entityId: username, data: { DB_USERNAME: username, DB_PASSWORD: password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    await $withConnection(
      providerInputs,
      "Failed to revoke lease from provider",
      (connection) => deleteKafkaUser(connection, entityId),
      [entityId]
    );
    return { entityId };
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
