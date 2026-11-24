import {
  InvalidReplicationGroupStateFault,
  InvalidUserGroupStateFault,
  UserAlreadyExistsFault,
  UserGroupAlreadyExistsFault,
  UserGroupNotFoundFault
} from "@aws-sdk/client-elasticache";
import { describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";

import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";

type TCommand = {
  constructor: { name: string };
  input: {
    ReplicationGroupId: string;
    UserGroupId: string;
    UserId: string;
    UserName: string;
    AccessString: string;
    UserIds: string[];
    UserIdsToAdd: string[];
    UserGroupIdsToAdd: string[];
    UserGroupIdsToRemove: string[];
  };
};

const aws = vi.hoisted(() => ({ handle: (() => ({})) as (command: TCommand) => unknown }));

vi.mock("@app/lib/crypto/cryptography", async (importOriginal) => {
  const { crypto } = await importOriginal<typeof import("@app/lib/crypto/cryptography")>();
  return { crypto: { ...crypto, isFipsModeEnabled: () => false } };
});
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@aws-sdk/client-elasticache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-elasticache")>()),
  ElastiCache: class {
    // eslint-disable-next-line class-methods-use-this
    async send(command: TCommand) {
      return aws.handle(command);
    }
  }
}));

const LEGACY_SHARED_USER_GROUP_ID = "infisical-managed-group-elasticache";
const DISABLED_DEFAULT_USER_ID = "infisical-disabled-default";
const BUSY_MESSAGE = "ElastiCache is still updating the user group for this cluster";

// Enforces the AWS rules the provider has to work around, as observed on live clusters: a cluster holds one user
// group, a new group is "creating" and can't be attached or modified, and a group whose users just changed is
// "modifying", which can be attached but not modified again. pendingRemovals holds groups the customer is removing
// from a cluster, which keeps the cluster busy. activateUserGroups() stands in for AWS finishing.
const fakeAccount = (initialClusters: Record<string, string[]>, initialUserGroups: Record<string, string[]>) => {
  const clusters = { ...initialClusters };
  const userGroups = { ...initialUserGroups };
  const users: Record<string, { UserName: string; AccessString: string }> = {};
  const pendingStatus = new Map<string, "creating" | "modifying">();
  const pendingRemovals: Record<string, string[]> = {};
  const invalidState = (userGroupId: string) =>
    new InvalidUserGroupStateFault({
      message: `User group ${userGroupId} has status ${pendingStatus.get(userGroupId)}.`,
      $metadata: {}
    });

  aws.handle = ({ constructor: { name }, input }) => {
    switch (name) {
      case "DescribeReplicationGroupsCommand":
        return {
          ReplicationGroups: [
            {
              UserGroupIds: clusters[input.ReplicationGroupId],
              PendingModifiedValues: { UserGroups: { UserGroupIdsToRemove: pendingRemovals[input.ReplicationGroupId] } }
            }
          ]
        };
      case "DescribeUserGroupsCommand":
        if (!userGroups[input.UserGroupId]) throw new UserGroupNotFoundFault({ message: "not found", $metadata: {} });
        return {
          UserGroups: [
            { Status: pendingStatus.get(input.UserGroupId) ?? "active", UserIds: userGroups[input.UserGroupId] }
          ]
        };
      case "CreateUserGroupCommand":
        if (userGroups[input.UserGroupId]) {
          throw new UserGroupAlreadyExistsFault({ message: "exists", $metadata: {} });
        }
        userGroups[input.UserGroupId] = [...input.UserIds];
        pendingStatus.set(input.UserGroupId, "creating");
        return {};
      case "ModifyReplicationGroupCommand": {
        if (pendingRemovals[input.ReplicationGroupId]) {
          throw new InvalidReplicationGroupStateFault({ message: "Cluster is modifying.", $metadata: {} });
        }
        const creatingGroupId = input.UserGroupIdsToAdd.find((id) => pendingStatus.get(id) === "creating");
        if (creatingGroupId) throw invalidState(creatingGroupId);
        const kept = clusters[input.ReplicationGroupId].filter((id) => !input.UserGroupIdsToRemove.includes(id));
        if (kept.length + input.UserGroupIdsToAdd.length > 1) {
          throw new Error("Max number of user groups per replication group allowed is 1");
        }
        clusters[input.ReplicationGroupId] = [...kept, ...input.UserGroupIdsToAdd];
        return {};
      }
      case "CreateUserCommand":
        if (users[input.UserId]) throw new UserAlreadyExistsFault({ message: "exists", $metadata: {} });
        users[input.UserId] = { UserName: input.UserName, AccessString: input.AccessString };
        return {};
      case "DeleteUserCommand":
        Reflect.deleteProperty(users, input.UserId);
        Object.values(userGroups).forEach((userIds) => {
          if (userIds.includes(input.UserId)) userIds.splice(userIds.indexOf(input.UserId), 1);
        });
        return {};
      case "ModifyUserGroupCommand":
        if (pendingStatus.has(input.UserGroupId)) throw invalidState(input.UserGroupId);
        userGroups[input.UserGroupId].push(...input.UserIdsToAdd);
        pendingStatus.set(input.UserGroupId, "modifying");
        return {};
      default:
        return {};
    }
  };
  const activateUserGroups = () => {
    pendingStatus.clear();
    Object.entries(pendingRemovals).forEach(([clusterName, removedIds]) => {
      clusters[clusterName] = clusters[clusterName].filter((id) => !removedIds.includes(id));
      Reflect.deleteProperty(pendingRemovals, clusterName);
    });
  };
  return { clusters, userGroups, users, pendingRemovals, activateUserGroups };
};

const inputs = (clusterName: string) => ({
  clusterName,
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  region: "us-east-1",
  creationStatement: JSON.stringify({
    UserId: "{{username}}",
    UserName: "{{username}}",
    Engine: "redis",
    Passwords: ["{{password}}"],
    AccessString: "on ~* +@all"
  }),
  revocationStatement: JSON.stringify({ UserId: "{{username}}" })
});

const saveDynamicSecret = (clusterName: string) =>
  AwsElastiCacheDatabaseProvider().validateConnection(inputs(clusterName), { projectId: "proj-1" });

const createLease = (clusterName: string) =>
  AwsElastiCacheDatabaseProvider().create({
    inputs: inputs(clusterName),
    expireAt: Date.now() + 60 * 60 * 1000,
    identity: { name: "user@example.com" },
    dynamicSecret: { id: "dynamic-secret-1" } as TDynamicSecrets,
    metadata: { projectId: "proj-1" }
  });

describe("AwsElastiCacheDatabaseProvider user groups", () => {
  test("gives each cluster its own user group with a disabled default user, and a lease joins only that group", async () => {
    // The longest cluster names AWS allows, differing only in the last character
    const clusterA = `${"a".repeat(39)}1`;
    const clusterB = `${"a".repeat(39)}2`;
    const account = fakeAccount({ [clusterA]: [], [clusterB]: [] }, {});

    await saveDynamicSecret(clusterA);
    await saveDynamicSecret(clusterB);
    account.activateUserGroups();
    const firstLeaseA = await createLease(clusterA);
    const leaseB = await createLease(clusterB);
    account.activateUserGroups();
    const secondLeaseA = await createLease(clusterA);

    const [groupA] = account.clusters[clusterA];
    const [groupB] = account.clusters[clusterB];
    expect(groupA).not.toBe(groupB);
    expect(groupA.length).toBeLessThanOrEqual(40);
    expect(account.userGroups[groupA]).toEqual([DISABLED_DEFAULT_USER_ID, firstLeaseA.entityId, secondLeaseA.entityId]);
    expect(account.userGroups[groupB]).toEqual([DISABLED_DEFAULT_USER_ID, leaseB.entityId]);
    expect(account.users[DISABLED_DEFAULT_USER_ID]).toEqual({ UserName: "default", AccessString: "off -@all" });
  });

  test("refuses a lease without creating a user while the cluster's user group is still being created", async () => {
    const account = fakeAccount({ "cluster-a": [] }, {});

    await expect(createLease("cluster-a")).rejects.toThrow(BUSY_MESSAGE);
    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID]);

    account.activateUserGroups();
    const lease = await createLease("cluster-a");
    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID, lease.entityId]);
  });

  test("asks a lease to retry, without leaving its user behind, while the previous lease is still being applied", async () => {
    const account = fakeAccount({ "cluster-a": [] }, {});

    await saveDynamicSecret("cluster-a");
    account.activateUserGroups();
    const firstLease = await createLease("cluster-a");

    await expect(createLease("cluster-a")).rejects.toThrow(BUSY_MESSAGE);
    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID, firstLease.entityId]);
  });

  test("accepts dynamic secrets for the same cluster saved at the same time", async () => {
    const account = fakeAccount({ "cluster-a": [] }, {});

    await expect(Promise.all([saveDynamicSecret("cluster-a"), saveDynamicSecret("cluster-a")])).resolves.toEqual([
      true,
      true
    ]);
    expect(Object.keys(account.userGroups)).toHaveLength(1);
  });

  test("refuses a cluster that already uses another user group, without creating anything", async () => {
    const account = fakeAccount({ "cluster-a": ["customer-user-group"] }, { "customer-user-group": ["default"] });
    const otherGroupMessage = "already uses the user group 'customer-user-group'";

    await expect(saveDynamicSecret("cluster-a")).rejects.toThrow(otherGroupMessage);
    await expect(createLease("cluster-a")).rejects.toThrow(otherGroupMessage);
    expect(account.users).toEqual({});
    expect(Object.keys(account.userGroups)).toEqual(["customer-user-group"]);
  });

  test("keeps a cluster on the legacy shared group, so its existing leases keep working", async () => {
    const account = fakeAccount(
      { "cluster-a": [LEGACY_SHARED_USER_GROUP_ID] },
      { [LEGACY_SHARED_USER_GROUP_ID]: ["default", "inf-existing-lease"] }
    );

    await saveDynamicSecret("cluster-a");
    const lease = await createLease("cluster-a");

    expect(account.clusters["cluster-a"]).toEqual([LEGACY_SHARED_USER_GROUP_ID]);
    expect(account.userGroups).toEqual({
      [LEGACY_SHARED_USER_GROUP_ID]: ["default", "inf-existing-lease", lease.entityId]
    });
    expect(Object.keys(account.users)).toEqual([lease.entityId]);
  });

  test("gives a cluster its own user group once the customer removes the legacy shared group", async () => {
    const account = fakeAccount(
      { "cluster-a": [LEGACY_SHARED_USER_GROUP_ID] },
      { [LEGACY_SHARED_USER_GROUP_ID]: ["default", "inf-existing-lease"] }
    );
    account.pendingRemovals["cluster-a"] = [LEGACY_SHARED_USER_GROUP_ID];

    await expect(createLease("cluster-a")).rejects.toThrow(BUSY_MESSAGE);
    account.activateUserGroups();
    const lease = await createLease("cluster-a");

    const [groupA] = account.clusters["cluster-a"];
    expect(groupA).not.toBe(LEGACY_SHARED_USER_GROUP_ID);
    expect(account.userGroups[groupA]).toEqual([DISABLED_DEFAULT_USER_ID, lease.entityId]);
    expect(account.userGroups[LEGACY_SHARED_USER_GROUP_ID]).toEqual(["default", "inf-existing-lease"]);
  });
});
