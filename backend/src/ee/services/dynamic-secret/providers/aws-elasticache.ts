import {
  CreateUserCommand,
  CreateUserGroupCommand,
  DeleteUserCommand,
  DescribeReplicationGroupsCommand,
  DescribeUserGroupsCommand,
  ElastiCache,
  ModifyReplicationGroupCommand,
  ModifyUserGroupCommand
} from "@aws-sdk/client-elasticache";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import { DynamicSecretAwsElastiCacheSchema, TDynamicProviderFns } from "./models";

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

const ElastiCacheUserManager = (credentials: TBasicAWSCredentials, region: string) => {
  const elastiCache = new ElastiCache({
    region,
    credentials
  });
  const infisicalGroup = "infisical-managed-group-elasticache";

  const ensureInfisicalGroupExists = async (clusterName: string) => {
    const replicationGroups = await elastiCache.send(new DescribeUserGroupsCommand());

    const existingGroup = replicationGroups.UserGroups?.find((group) => group.UserGroupId === infisicalGroup);

    let newlyCreatedGroup = false;
    if (!existingGroup) {
      const createGroupCommand = new CreateUserGroupCommand({
        UserGroupId: infisicalGroup,
        UserIds: ["default"],
        Engine: "redis"
      });

      await elastiCache.send(createGroupCommand);
      newlyCreatedGroup = true;
    }

    if (existingGroup || newlyCreatedGroup) {
      const replicationGroup = (
        await elastiCache.send(
          new DescribeReplicationGroupsCommand({
            ReplicationGroupId: clusterName
          })
        )
      ).ReplicationGroups?.[0];

      if (!replicationGroup?.UserGroupIds?.includes(infisicalGroup)) {
        // If the replication group doesn't have the infisical user group, we need to associate it
        const modifyGroupCommand = new ModifyReplicationGroupCommand({
          UserGroupIdsToAdd: [infisicalGroup],
          UserGroupIdsToRemove: [],
          ApplyImmediately: true,
          ReplicationGroupId: clusterName
        });
        await elastiCache.send(modifyGroupCommand);
      }
    }
  };

  const addUserToInfisicalGroup = async (userId: string) => {
    // figure out if the default user is already in the group, if it is, then we shouldn't add it again

    const addUserToGroupCommand = new ModifyUserGroupCommand({
      UserGroupId: infisicalGroup,
      UserIdsToAdd: [userId],
      UserIdsToRemove: []
    });

    await elastiCache.send(addUserToGroupCommand);
  };

  const createUser = async (creationInput: TCreateElastiCacheUserInput, clusterName: string) => {
    await ensureInfisicalGroupExists(clusterName);

    await elastiCache.send(new CreateUserCommand(creationInput)); // First create the user
    await addUserToInfisicalGroup(creationInput.UserId); // Then add the user to the group. We know the group is already a part of the cluster because of ensureInfisicalGroupExists()

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
    verifyCredentials
  };
};

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

    // We need to ensure the that the creation & revocation statements are valid and can be used to create and revoke users.
    // We can't return the parsed statements here because we need to use the handlebars template to generate the username and password, before we can use the parsed statements.
    CreateElastiCacheUserSchema.parse(JSON.parse(providerInputs.creationStatement));
    DeleteElasticCacheUserSchema.parse(JSON.parse(providerInputs.revocationStatement));

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
