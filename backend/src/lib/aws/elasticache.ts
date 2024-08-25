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
import { z } from "zod";

type TElastiCacheRedisUser = {
  userId: string;
  password: string;
};

type TBasicAWSCredentials = { accessKeyId: string; secretAccessKey: string };

export const CreateElastiCacheUserSchema = z.object({
  UserId: z.string().trim().min(1),
  UserName: z.string().trim().min(1),
  Engine: z.string().default("redis"),
  Passwords: z.array(z.string().trim().min(1)).min(1).max(1), // Minimum password length is 16 characters, required by AWS.
  AccessString: z.string().trim().min(1) // Example: "on ~* +@all"
});

export const DeleteElasticCacheUserSchema = z.object({
  UserId: z.string().trim().min(1)
});

export type TCreateElastiCacheUserInput = z.infer<typeof CreateElastiCacheUserSchema>;
export type TDeleteElastiCacheUserInput = z.infer<typeof DeleteElasticCacheUserSchema>;

export const ElastiCacheUserManager = (credentials: TBasicAWSCredentials, region: string) => {
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
