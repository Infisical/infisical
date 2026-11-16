import {
  CreateUserCommand,
  CreateUserGroupCommand,
  DeleteUserCommand,
  DescribeReplicationGroupsCommand,
  DescribeUserGroupsCommand,
  ElastiCache,
  ModifyReplicationGroupCommand,
  ModifyUserGroupCommand,
  UserAlreadyExistsFault,
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

// Every cluster used to be attached to this one group, so its users can log in to all of those clusters.
const LEGACY_SHARED_USER_GROUP_ID = "infisical-managed-group-elasticache";
// Every user group needs a user named "default", which serves clients that connect without a password. AWS's own has
// full access, so groups get this disabled one instead.
const DISABLED_DEFAULT_USER_ID = "infisical-disabled-default";

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
    return [
      ...(replicationGroup?.UserGroupIds ?? []),
      ...(replicationGroup?.PendingModifiedValues?.UserGroups?.UserGroupIdsToAdd ?? [])
    ];
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
    if (await $getUserGroup(userGroupId)) return;

    // A cluster holds a single user group, so the legacy group's users move into the new one to keep the cluster's
    // existing leases working once the legacy group is swapped out. The legacy group doesn't record which cluster a
    // user is for, so all of them move; each is deleted when its lease ends.
    const legacyUserIds = (await $getReplicationGroupUserGroupIds(clusterName)).includes(LEGACY_SHARED_USER_GROUP_ID)
      ? ((await $getUserGroup(LEGACY_SHARED_USER_GROUP_ID))?.UserIds ?? []).filter((userId) => userId !== "default")
      : [];

    await $ensureDisabledDefaultUserExists();
    await elastiCache.send(
      new CreateUserGroupCommand({
        UserGroupId: userGroupId,
        UserIds: [DISABLED_DEFAULT_USER_ID, ...legacyUserIds],
        Engine: "redis"
      })
    );
  };

  const $resolveClusterUserGroup = async (clusterName: string) => {
    const attachedUserGroupIds = await $getReplicationGroupUserGroupIds(clusterName);
    const userGroupId = getClusterUserGroupId(clusterName);
    if (attachedUserGroupIds.includes(userGroupId)) return userGroupId;

    // AWS refuses to attach a user group until it is active.
    if ((await $getUserGroup(userGroupId))?.Status !== "active") {
      throw new BadRequestError({
        message:
          "ElastiCache is still setting up the user group for this cluster. Try creating the lease again in a minute."
      });
    }

    await elastiCache.send(
      new ModifyReplicationGroupCommand({
        ReplicationGroupId: clusterName,
        UserGroupIdsToAdd: [userGroupId],
        UserGroupIdsToRemove: attachedUserGroupIds.includes(LEGACY_SHARED_USER_GROUP_ID)
          ? [LEGACY_SHARED_USER_GROUP_ID]
          : [],
        ApplyImmediately: true
      })
    );
    return userGroupId;
  };

  const createUser = async (creationInput: TCreateElastiCacheUserInput, clusterName: string) => {
    const userGroupId = await $resolveClusterUserGroup(clusterName);

    await elastiCache.send(new CreateUserCommand(creationInput));
    await elastiCache.send(
      new ModifyUserGroupCommand({
        UserGroupId: userGroupId,
        UserIdsToAdd: [creationInput.UserId],
        UserIdsToRemove: []
      })
    );

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
