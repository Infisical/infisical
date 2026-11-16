import {
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
const SETTING_UP_MESSAGE = "ElastiCache is still setting up the user group for this cluster";

// Enforces the AWS rules the provider has to work around: a cluster holds one user group, and a new group can't be
// attached or modified until it is active, which the test triggers with activateUserGroups().
const fakeAccount = (initialClusters: Record<string, string[]>, initialUserGroups: Record<string, string[]>) => {
  const clusters = { ...initialClusters };
  const userGroups = { ...initialUserGroups };
  const users: Record<string, { UserName: string; AccessString: string }> = {};
  const creating = new Set<string>();
  const assertActive = (userGroupId: string) => {
    if (creating.has(userGroupId)) throw new Error(`User group ${userGroupId} has status creating`);
  };

  aws.handle = ({ constructor: { name }, input }) => {
    switch (name) {
      case "DescribeReplicationGroupsCommand":
        return { ReplicationGroups: [{ UserGroupIds: clusters[input.ReplicationGroupId] }] };
      case "DescribeUserGroupsCommand":
        if (!userGroups[input.UserGroupId]) throw new UserGroupNotFoundFault({ message: "not found", $metadata: {} });
        return {
          UserGroups: [
            { Status: creating.has(input.UserGroupId) ? "creating" : "active", UserIds: userGroups[input.UserGroupId] }
          ]
        };
      case "CreateUserGroupCommand":
        if (userGroups[input.UserGroupId]) {
          throw new UserGroupAlreadyExistsFault({ message: "exists", $metadata: {} });
        }
        userGroups[input.UserGroupId] = [...input.UserIds];
        creating.add(input.UserGroupId);
        return {};
      case "ModifyReplicationGroupCommand": {
        input.UserGroupIdsToAdd.forEach(assertActive);
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
        assertActive(input.UserGroupId);
        userGroups[input.UserGroupId].push(...input.UserIdsToAdd);
        return {};
      default:
        return {};
    }
  };
  return { clusters, userGroups, users, activateUserGroups: () => creating.clear() };
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

    await expect(createLease("cluster-a")).rejects.toThrow(SETTING_UP_MESSAGE);
    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID]);

    account.activateUserGroups();
    const lease = await createLease("cluster-a");
    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID, lease.entityId]);
  });

  test("accepts dynamic secrets for the same cluster saved at the same time", async () => {
    const account = fakeAccount({ "cluster-a": [] }, {});

    await expect(Promise.all([saveDynamicSecret("cluster-a"), saveDynamicSecret("cluster-a")])).resolves.toEqual([
      true,
      true
    ]);
    expect(Object.keys(account.userGroups)).toHaveLength(1);
  });

  test("deletes the lease user when the cluster can't take its own user group", async () => {
    const account = fakeAccount({ "cluster-a": ["customer-user-group"] }, { "customer-user-group": ["default"] });

    await saveDynamicSecret("cluster-a");
    account.activateUserGroups();
    await expect(createLease("cluster-a")).rejects.toThrow(
      "Max number of user groups per replication group allowed is 1"
    );

    expect(Object.keys(account.users)).toEqual([DISABLED_DEFAULT_USER_ID]);
    expect(Object.values(account.userGroups).flat()).not.toContainEqual(expect.stringMatching(/^inf-/));
  });

  test("moves a cluster off the legacy shared group without dropping any of its leases", async () => {
    const account = fakeAccount(
      { "cluster-a": [LEGACY_SHARED_USER_GROUP_ID], "cluster-b": [LEGACY_SHARED_USER_GROUP_ID] },
      { [LEGACY_SHARED_USER_GROUP_ID]: ["default", "inf-existing-lease"] }
    );

    await expect(createLease("cluster-a")).rejects.toThrow(SETTING_UP_MESSAGE);
    // A server still running the previous version adds a lease to the legacy group mid-upgrade
    account.userGroups[LEGACY_SHARED_USER_GROUP_ID].push("inf-lease-from-previous-version");
    account.activateUserGroups();
    const lease = await createLease("cluster-a");

    const [groupA] = account.clusters["cluster-a"];
    expect(groupA).not.toBe(LEGACY_SHARED_USER_GROUP_ID);
    expect(account.userGroups[groupA]).toEqual([
      DISABLED_DEFAULT_USER_ID,
      lease.entityId,
      "inf-existing-lease",
      "inf-lease-from-previous-version"
    ]);
    expect(account.clusters["cluster-b"]).toEqual([LEGACY_SHARED_USER_GROUP_ID]);
  });
});
