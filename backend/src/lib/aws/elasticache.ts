import { Sha256 } from "@aws-crypto/sha256-js";
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
import { QueryParameterBag } from "@aws-sdk/types";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { z } from "zod";

type TElastiCacheRedisUser = {
  userId: string;
  password: string;
};

type TBasicAWSCredentials = { accessKeyId: string; secretAccessKey: string };
type TElastiCacheConnection = {
  host: string;
  port: number;
  userId: string; // the redis user configured for IAM auth
};

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

  const createUser = async (creationInput: TCreateElastiCacheUserInput) => {
    await ensureInfisicalGroupExists("newtest-redis-oss"); // TODO: Make this not hardcoded (currently hardcoded for testing)

    await elastiCache.send(new CreateUserCommand({ ...creationInput })); // First create the user
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

  return {
    createUser,
    deleteUser
  };
};

export const ElastiCacheConnector = (
  connection: TElastiCacheConnection,
  credentials: TBasicAWSCredentials,
  region: string,
  isServerless = false
) => {
  const constants = {
    REQUEST_METHOD: "GET",
    PARAM_ACTION: "Action",
    PARAM_USER: "User",
    PARAM_RESOURCE_TYPE: "ResourceType",
    RESOURCE_TYPE_SERVERLESS_CACHE: "ServerlessCache",
    ACTION_NAME: "connect",
    SERVICE_NAME: "elasticache",
    TOKEN_EXPIRY_SECONDS: 900
  };

  const getSignableRequest = () => {
    const query: Record<string, string> = {
      [constants.PARAM_ACTION]: constants.ACTION_NAME,
      [constants.PARAM_USER]: connection.userId
    };

    if (isServerless) {
      query[constants.PARAM_RESOURCE_TYPE] = constants.RESOURCE_TYPE_SERVERLESS_CACHE;
    }

    return new HttpRequest({
      method: constants.REQUEST_METHOD,
      hostname: `${connection.host}:${connection.port}`,
      headers: {
        host: `${connection.host}:${connection.port}`
      },
      path: "/",
      query
    });
  };

  const sign = async (request: HttpRequest) => {
    const signer = new SignatureV4({
      credentials,
      region,
      service: constants.SERVICE_NAME,
      sha256: Sha256
    });

    const expiresIn = constants.TOKEN_EXPIRY_SECONDS;
    const signedRequest = await signer.presign(request, { expiresIn });

    // Create a new HttpRequest object with the signed properties
    return new HttpRequest({
      method: signedRequest.method,
      hostname: signedRequest.hostname,
      headers: signedRequest.headers,
      path: signedRequest.path,
      query: signedRequest.query
    });
  };

  const queryToString = (query: QueryParameterBag) => {
    return Object.entries(query)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join("&");
        }
        if (value !== null) {
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
        return encodeURIComponent(key);
      })
      .join("&");
  };

  const createConnectionUri = async () => {
    const request = getSignableRequest();
    const signedRequest = await sign(request);

    return `redis://${signedRequest.hostname}${signedRequest.path}?${queryToString(signedRequest.query)}`;
  };

  return { createConnectionUri };
};
