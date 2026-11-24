import {
  CreateUserCommand,
  CreateUserGroupCommand,
  DeleteUserCommand,
  DescribeReplicationGroupsCommand,
  DescribeUserGroupsCommand,
  ElastiCache,
  InvalidReplicationGroupStateFault,
  InvalidUserGroupStateFault,
  ModifyReplicationGroupCommand,
  ModifyUserGroupCommand,
  UserAlreadyExistsFault,
  UserGroupAlreadyExistsFault,
  UserGroupNotFoundFault
} from "@aws-sdk/client-elasticache";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretAwsElastiCacheSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const CreateElastiCacheUserSchema = z.object({
  UserId: z.string().trim().min(1),
  UserName: z.string().trim().min(1),
  Engine: z.string().default("redis"),
  Passwords: z.array(z.string().trim().min(1)).min(1).max(1), // Minimum password length is 16 characters, required by AWS.
  AccessString: z.string().trim().min(1) // Example: "on ~* +@all"
});

const DeleteElasticCacheUserSchema = z.object({
  UserId: z.string().trim().min(1)
});

type TElastiCacheRedisUser = { userId: string; password: string };
type TBasicAWSCredentials = { accessKeyId: string; secretAccessKey: string };

type TCreateElastiCacheUserInput = z.infer<typeof CreateElastiCacheUserSchema>;
type TDeleteElastiCacheUserInput = z.infer<typeof DeleteElasticCacheUserSchema>;

// Every cluster used to be attached to this one group, so its users can log in to all of those clusters. Clusters still
// on it keep it so their leases keep working, until the customer removes it from the cluster.
const LEGACY_SHARED_USER_GROUP_ID = "infisical-managed-group-elasticache";
// Every user group needs a user named "default", which serves clients that connect without a password. AWS's own has
// full access, so groups get this disabled one instead.
const DISABLED_DEFAULT_USER_ID = "infisical-disabled-default";

// A new user group takes up to a minute to become active, and adding users keeps it busy for about as long.
const USER_GROUP_BUSY_MESSAGE =
  "ElastiCache is still updating the user group for this cluster. Try creating the lease again in a minute.";

// User group IDs are capped at 40 characters, the same as cluster names, so the ID holds a hash of the name.
const getClusterUserGroupId = (clusterName: string) =>
  `infisical-${crypto.nativeCrypto.createHash("sha256").update(clusterName.toLowerCase()).digest("hex").slice(0, 16)}`;

const ElastiCacheUserManager = (credentials: TBasicAWSCredentials, region: string) => {
  const elastiCache = new ElastiCache({
    region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials
  });

  const $getUserGroup = async (userGroupId: string) => {
    try {
      return (await elastiCache.send(new DescribeUserGroupsCommand({ UserGroupId: userGroupId }))).UserGroups?.[0];
    } catch (err) {
      if (err instanceof UserGroupNotFoundFault) return undefined;
      throw err;
    }
  };

  const $getReplicationGroupUserGroupIds = async (clusterName: string) => {
    const replicationGroup = (
      await elastiCache.send(new DescribeReplicationGroupsCommand({ ReplicationGroupId: clusterName }))
    ).ReplicationGroups?.[0];
    const pendingUserGroups = replicationGroup?.PendingModifiedValues?.UserGroups;
    // A group being removed counts as gone, so a lease right after the customer removes the legacy group isn't added
    // to it.
    return [...(replicationGroup?.UserGroupIds ?? []), ...(pendingUserGroups?.UserGroupIdsToAdd ?? [])].filter(
      (id) => !pendingUserGroups?.UserGroupIdsToRemove?.includes(id)
    );
  };

  const $ensureDisabledDefaultUserExists = async () => {
    try {
      await elastiCache.send(
        new CreateUserCommand({
          UserId: DISABLED_DEFAULT_USER_ID,
          UserName: "default",
          Engine: "redis",
          Passwords: [crypto.randomBytes(32).toString("hex")],
          AccessString: "off -@all"
        })
      );
    } catch (err) {
      if (!(err instanceof UserAlreadyExistsFault)) throw err;
    }
  };

  // A new user group takes up to a minute to become active, so this runs when the dynamic secret is saved as well as
  // on every lease, which is asked to retry until the group is ready.
  const ensureClusterUserGroupExists = async (clusterName: string) => {
    const userGroupId = getClusterUserGroupId(clusterName);
    const attachedUserGroupIds = await $getReplicationGroupUserGroupIds(clusterName);
    if (attachedUserGroupIds.includes(LEGACY_SHARED_USER_GROUP_ID)) return;

    const otherUserGroupId = attachedUserGroupIds.find((id) => id !== userGroupId);
    if (otherUserGroupId) {
      throw new BadRequestError({
        message: `The ElastiCache cluster already uses the user group '${otherUserGroupId}'. A cluster can use only one user group, and Infisical needs its own to issue leases. Remove that user group from the cluster, or use a different cluster.`
      });
    }
    if (await $getUserGroup(userGroupId)) return;

    await $ensureDisabledDefaultUserExists();
    try {
      await elastiCache.send(
        new CreateUserGroupCommand({ UserGroupId: userGroupId, UserIds: [DISABLED_DEFAULT_USER_ID], Engine: "redis" })
      );
    } catch (err) {
      if (!(err instanceof UserGroupAlreadyExistsFault)) throw err;
    }
  };

  const createUser = async (creationInput: TCreateElastiCacheUserInput, clusterName: string) => {
    const attachedUserGroupIds = await $getReplicationGroupUserGroupIds(clusterName);
    const userGroupId = attachedUserGroupIds.includes(LEGACY_SHARED_USER_GROUP_ID)
      ? LEGACY_SHARED_USER_GROUP_ID
      : getClusterUserGroupId(clusterName);
    const isAttached = attachedUserGroupIds.includes(userGroupId);

    // AWS refuses to modify a user group until it is active.
    if (!isAttached && (await $getUserGroup(userGroupId))?.Status !== "active") {
      throw new BadRequestError({ message: USER_GROUP_BUSY_MESSAGE });
    }

    await elastiCache.send(new CreateUserCommand(creationInput));
    try {
      await elastiCache.send(
        new ModifyUserGroupCommand({
          UserGroupId: userGroupId,
          UserIdsToAdd: [creationInput.UserId],
          UserIdsToRemove: []
        })
      );

      if (!isAttached) {
        // AWS accepts attaching a user group while the change above is still being applied.
        await elastiCache.send(
          new ModifyReplicationGroupCommand({
            ReplicationGroupId: clusterName,
            UserGroupIdsToAdd: [userGroupId],
            UserGroupIdsToRemove: [],
            ApplyImmediately: true
          })
        );
      }
    } catch (err) {
      // no lease will be saved to revoke whatever was already created
      await elastiCache
        .send(new DeleteUserCommand({ UserId: creationInput.UserId }))
        .catch((cleanupErr) =>
          logger.error(cleanupErr, `Failed to clean up ElastiCache user [userId=${creationInput.UserId}]`)
        );
      // The group or cluster is still applying an earlier change, such as the previous lease
      if (err instanceof InvalidUserGroupStateFault || err instanceof InvalidReplicationGroupStateFault) {
        throw new BadRequestError({ message: USER_GROUP_BUSY_MESSAGE });
      }
      throw err;
    }

    return {
      userId: creationInput.UserId,
      password: creationInput.Passwords[0]
    };
  };

  const deleteUser = async (
    deletionInput: TDeleteElastiCacheUserInput
  ): Promise<Pick<TElastiCacheRedisUser, "userId">> => {
    await elastiCache.send(new DeleteUserCommand(deletionInput));
    return { userId: deletionInput.UserId };
  };

  const verifyCredentials = async (clusterName: string) => {
    await elastiCache.send(
      new DescribeReplicationGroupsCommand({
        ReplicationGroupId: clusterName
      })
    );
  };

  return {
    createUser,
    deleteUser,
    verifyCredentials,
    ensureClusterUserGroupExists
  };
};

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

export const AwsElastiCacheDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = DynamicSecretAwsElastiCacheSchema.parse(inputs);

    // We need to ensure the that the creation & revocation statements are valid and can be used to create and revoke users.
    // We can't return the parsed statements here because we need to use the handlebars template to generate the username and password, before we can use the parsed statements.
    CreateElastiCacheUserSchema.parse(JSON.parse(providerInputs.creationStatement));
    DeleteElasticCacheUserSchema.parse(JSON.parse(providerInputs.revocationStatement));
    validateHandlebarTemplate("AWS ElastiCache creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration"].includes(val)
    });
    if (providerInputs.revocationStatement) {
      validateHandlebarTemplate("AWS ElastiCache revoke", providerInputs.revocationStatement, {
        allowedExpressions: (val) => ["username"].includes(val)
      });
    }

    return providerInputs;
  };
  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    try {
      const userManager = ElastiCacheUserManager(
        {
          accessKeyId: providerInputs.accessKeyId,
          secretAccessKey: providerInputs.secretAccessKey
        },
        providerInputs.region
      );
      await userManager.verifyCredentials(providerInputs.clusterName);
      await userManager.ensureClusterUserGroupExists(providerInputs.clusterName);
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [
          providerInputs.accessKeyId,
          providerInputs.secretAccessKey,
          providerInputs.clusterName,
          providerInputs.region
        ]
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
    if (!(await validateConnection(providerInputs))) {
      throw new BadRequestError({ message: "Failed to establish connection" });
    }

    const leaseUsername = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,

      usernameCharset: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-",
      usernamePrefix: "inf-"
    });
    const leasePassword = generatePassword();
    const leaseExpiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username: leaseUsername,
      password: leasePassword,
      expiration: leaseExpiration
    });

    const parsedStatement = CreateElastiCacheUserSchema.parse(JSON.parse(creationStatement));

    try {
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
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [
          leaseUsername,
          leasePassword,
          providerInputs.accessKeyId,
          providerInputs.secretAccessKey,
          providerInputs.clusterName
        ]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement, { noEscape: true })({
      username: entityId
    });
    const parsedStatement = DeleteElasticCacheUserSchema.parse(JSON.parse(revokeStatement));

    try {
      await ElastiCacheUserManager(
        {
          accessKeyId: providerInputs.accessKeyId,
          secretAccessKey: providerInputs.secretAccessKey
        },
        providerInputs.region
      ).deleteUser(parsedStatement);

      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [entityId, providerInputs.accessKeyId, providerInputs.secretAccessKey, providerInputs.clusterName]
      });
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
