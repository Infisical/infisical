import { pbkdf2Sync } from "node:crypto";

import {
  AclOperations,
  AclPermissionTypes,
  alterUserScramCredentialsV0,
  apiVersionsV3,
  createAclsV3,
  deleteAclsV3,
  describeAclsV3,
  describeUserScramCredentialsV0,
  metadataV9,
  ProtocolError,
  ResourcePatternTypes,
  ResourceTypes,
  ScramMechanisms
} from "@platformatic/kafka";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { verifyHostInputValidity } from "../dynamic-secret-fns";
import { KafkaProvider } from "./kafka";
import {
  DynamicSecretKafkaSchema,
  KafkaAclOperation,
  KafkaAclPatternType,
  KafkaAclPermissionType,
  KafkaAclResourceType,
  KafkaSaslMechanism
} from "./models";

const { FakeConnection } = vi.hoisted(() => {
  class Fake {
    static instances: Fake[] = [];

    static unreachablePorts = new Set<number>();

    host?: string;

    port?: number;

    constructor(
      public clientId: string,
      public options: { tls?: { servername?: string; ca?: string } }
    ) {
      Fake.instances.push(this);
    }

    connect(host: string, port: number) {
      this.host = host;
      this.port = port;
      return Fake.unreachablePorts.has(port)
        ? Promise.reject(new Error(`Connection to ${host}:${port} failed.`))
        : Promise.resolve();
    }

    close = vi.fn(() => Promise.resolve());
  }
  return { FakeConnection: Fake };
});

vi.mock("@platformatic/kafka", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platformatic/kafka")>()),
  Connection: FakeConnection
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("../dynamic-secret-fns", () => ({ verifyHostInputValidity: vi.fn() }));

const mockedVerifyHost = vi.mocked(verifyHostInputValidity);
const apiVersions = vi.spyOn(apiVersionsV3.api, "async");
const metadataRequest = vi.spyOn(metadataV9.api, "async");
const describeAcls = vi.spyOn(describeAclsV3.api, "async");
const describeScramCredentials = vi.spyOn(describeUserScramCredentialsV0.api, "async");
const createAcls = vi.spyOn(createAclsV3.api, "async");
const deleteAcls = vi.spyOn(deleteAclsV3.api, "async");
const alterScramCredentials = vi.spyOn(alterUserScramCredentialsV0.api, "async");

const RESOLVED_IPS: Record<string, string> = {
  "kafka-1.internal": "10.0.0.1",
  "kafka-2.internal": "10.0.0.2"
};

const SUPPORTED_APIS = [alterUserScramCredentialsV0.api, createAclsV3.api, deleteAclsV3.api].map(
  ({ key, version }) => ({ apiKey: key, minVersion: 0, maxVersion: version })
);

const kraftCluster = {
  apiKeys: SUPPORTED_APIS,
  finalizedFeatures: [{ name: "metadata.version", minVersionLevel: 20, maxVersionLevel: 20 }]
};

const zookeeperCluster = { apiKeys: SUPPORTED_APIS, finalizedFeatures: [] };

const baseInputs = {
  bootstrapServers: [{ host: "kafka-1.internal", port: 9092 }],
  saslMechanism: KafkaSaslMechanism.ScramSha512,
  username: "admin",
  password: "admin-secret",
  acls: [
    {
      resourceType: KafkaAclResourceType.Topic,
      patternType: KafkaAclPatternType.Literal,
      resourceName: "orders",
      operation: KafkaAclOperation.Write,
      permissionType: KafkaAclPermissionType.Allow
    },
    {
      resourceType: KafkaAclResourceType.Group,
      patternType: KafkaAclPatternType.Prefixed,
      resourceName: "orders-",
      operation: KafkaAclOperation.Read,
      permissionType: KafkaAclPermissionType.Allow
    }
  ],
  sslEnabled: false,
  sslRejectUnauthorized: true
};

const metadata = { projectId: "proj-1" };

const failoverInputs = {
  ...baseInputs,
  bootstrapServers: [
    { host: "kafka-1.internal", port: 9092 },
    { host: "kafka-2.internal", port: 9093 }
  ]
};

const createArgs = (inputs: object = baseInputs, usernameTemplate?: string) => ({
  inputs,
  usernameTemplate,
  expireAt: Date.now() + 60_000,
  identity: { name: "tester" },
  dynamicSecret: {} as TDynamicSecrets,
  metadata
});

const connectedTo = (connection: unknown) => {
  const { host, port } = connection as InstanceType<typeof FakeConnection>;
  return `${host}:${port}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  FakeConnection.instances = [];
  FakeConnection.unreachablePorts.clear();
  mockedVerifyHost.mockImplementation(({ host }) => Promise.resolve([RESOLVED_IPS[host] ?? host]));
  apiVersions.mockResolvedValue(kraftCluster as never);
  describeAcls.mockResolvedValue({ resources: [] } as never);
  describeScramCredentials.mockRejectedValue(new ProtocolError("RESOURCE_NOT_FOUND"));
  createAcls.mockResolvedValue([] as never);
  deleteAcls.mockResolvedValue([] as never);
  alterScramCredentials.mockResolvedValue({} as never);
});

describe("Kafka dynamic secret schema", () => {
  test("only accepts the kafka-cluster name for Cluster ACLs", () => {
    const clusterAcl = { resourceType: KafkaAclResourceType.Cluster, operation: KafkaAclOperation.Describe };

    expect(() =>
      DynamicSecretKafkaSchema.parse({ ...baseInputs, acls: [{ ...clusterAcl, resourceName: "prod" }] })
    ).toThrow("Cluster ACLs must use the resource name 'kafka-cluster'");
    expect(
      DynamicSecretKafkaSchema.parse({ ...baseInputs, acls: [{ ...clusterAcl, resourceName: "kafka-cluster" }] }).acls
    ).toEqual([
      {
        ...clusterAcl,
        resourceName: "kafka-cluster",
        patternType: KafkaAclPatternType.Literal,
        permissionType: KafkaAclPermissionType.Allow
      }
    ]);
  });
});

describe("KafkaProvider.validateConnection", () => {
  test("tries the bootstrap servers in order and checks every host", async () => {
    FakeConnection.unreachablePorts.add(9092);

    await expect(KafkaProvider().validateConnection(failoverInputs, metadata)).resolves.toBe(true);

    expect(mockedVerifyHost).toHaveBeenCalledWith({ host: "kafka-1.internal", isDynamicSecret: true });
    expect(mockedVerifyHost).toHaveBeenCalledWith({ host: "kafka-2.internal", isDynamicSecret: true });
    expect(connectedTo(describeAcls.mock.calls[0][0])).toBe("10.0.0.2:9093");
  });

  test("moves on to the next bootstrap server when a host doesn't resolve", async () => {
    mockedVerifyHost.mockImplementation(({ host }) =>
      host === "kafka-1.internal"
        ? Promise.reject(new Error("Could not resolve host"))
        : Promise.resolve([RESOLVED_IPS[host]])
    );

    await expect(KafkaProvider().validateConnection(failoverInputs, metadata)).resolves.toBe(true);

    expect(connectedTo(describeAcls.mock.calls[0][0])).toBe("10.0.0.2:9093");
  });

  test("dials the resolved IP and verifies TLS against the hostname", async () => {
    await KafkaProvider().validateConnection({ ...baseInputs, sslEnabled: true, ca: "test-ca" }, metadata);

    const [connection] = FakeConnection.instances;
    expect(connectedTo(connection)).toBe("10.0.0.1:9092");
    expect(connection.options.tls).toMatchObject({ servername: "kafka-1.internal", ca: "test-ca" });
  });

  test("keeps KRaft requests on the bootstrap connection", async () => {
    await KafkaProvider().validateConnection(baseInputs, metadata);

    expect(metadataRequest).not.toHaveBeenCalled();
    expect(FakeConnection.instances).toHaveLength(1);
  });

  test("sends ZooKeeper requests to the controller", async () => {
    apiVersions.mockResolvedValue(zookeeperCluster as never);
    metadataRequest.mockResolvedValue({
      controllerId: 2,
      brokers: [
        { nodeId: 1, host: "kafka-1.internal", port: 9092 },
        { nodeId: 2, host: "kafka-2.internal", port: 9093 }
      ]
    } as never);

    await KafkaProvider().validateConnection(baseInputs, metadata);

    expect(mockedVerifyHost).toHaveBeenCalledWith({ host: "kafka-2.internal", isDynamicSecret: true });
    expect(connectedTo(describeAcls.mock.calls[0][0])).toBe("10.0.0.2:9093");
    FakeConnection.instances.forEach((connection) => expect(connection.close).toHaveBeenCalled());
  });

  test("rejects Kafka versions that can't manage SCRAM users", async () => {
    apiVersions.mockResolvedValue({ ...kraftCluster, apiKeys: SUPPORTED_APIS.slice(1) } as never);

    await expect(KafkaProvider().validateConnection(baseInputs, metadata)).rejects.toThrow(
      "Kafka dynamic secrets require Kafka 2.7 or later with ZooKeeper, or 3.5 or later with KRaft."
    );
  });

  test("rejects clusters without an authorizer", async () => {
    describeAcls.mockRejectedValue(new ProtocolError("SECURITY_DISABLED"));

    await expect(KafkaProvider().validateConnection(baseInputs, metadata)).rejects.toThrow(
      "ACLs are not enabled on this Kafka cluster"
    );
  });
});

describe("KafkaProvider.create", () => {
  test("stores both SCRAM credentials in separate requests, then creates the ACLs", async () => {
    const { entityId, data } = await KafkaProvider().create(createArgs());
    const { DB_USERNAME: username, DB_PASSWORD: password } = data as Record<string, string>;

    expect(username).toBe(entityId);
    expect(password).toHaveLength(64);
    expect(alterScramCredentials).toHaveBeenCalledTimes(2);

    expect(alterScramCredentials.mock.calls.map(([, deletions, upsertions]) => [deletions, upsertions.length])).toEqual(
      [
        [[], 1],
        [[], 1]
      ]
    );
    const [sha256, sha512] = alterScramCredentials.mock.calls.map(([, , [upsertion]]) => upsertion);
    expect(sha256).toMatchObject({ name: username, mechanism: ScramMechanisms.SCRAM_SHA_256, iterations: 4096 });
    expect(sha256.saltedPassword).toEqual(pbkdf2Sync(password, sha256.salt, 4096, 32, "sha256"));
    expect(sha512).toMatchObject({ name: username, mechanism: ScramMechanisms.SCRAM_SHA_512, iterations: 4096 });
    expect(sha512.saltedPassword).toEqual(pbkdf2Sync(password, sha512.salt, 4096, 64, "sha512"));

    expect(createAcls.mock.calls[0][1]).toEqual([
      {
        resourceType: ResourceTypes.TOPIC,
        resourceName: "orders",
        resourcePatternType: ResourcePatternTypes.LITERAL,
        principal: `User:${username}`,
        host: "*",
        operation: AclOperations.WRITE,
        permissionType: AclPermissionTypes.ALLOW
      },
      {
        resourceType: ResourceTypes.GROUP,
        resourceName: "orders-",
        resourcePatternType: ResourcePatternTypes.PREFIXED,
        principal: `User:${username}`,
        host: "*",
        operation: AclOperations.READ,
        permissionType: AclPermissionTypes.ALLOW
      }
    ]);
  });

  test("removes the credentials and ACLs it created when a step fails", async () => {
    createAcls.mockRejectedValue(new ProtocolError("CLUSTER_AUTHORIZATION_FAILED"));

    const result = KafkaProvider().create(createArgs());

    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow("Failed to create lease from provider");

    const username = alterScramCredentials.mock.calls[0][2][0].name;
    expect(deleteAcls.mock.calls[0][1]).toEqual([expect.objectContaining({ principal: `User:${username}` })]);
    expect(alterScramCredentials.mock.calls.slice(2).map(([, deletions]) => deletions)).toEqual([
      [{ name: username, mechanism: ScramMechanisms.SCRAM_SHA_256 }],
      [{ name: username, mechanism: ScramMechanisms.SCRAM_SHA_512 }]
    ]);
  });

  test("still deletes the credentials when deleting the ACLs fails during cleanup", async () => {
    createAcls.mockRejectedValue(new ProtocolError("CLUSTER_AUTHORIZATION_FAILED"));
    deleteAcls.mockRejectedValue(new ProtocolError("CLUSTER_AUTHORIZATION_FAILED"));

    await expect(KafkaProvider().create(createArgs())).rejects.toThrow("Failed to create lease from provider");

    const username = alterScramCredentials.mock.calls[0][2][0].name;
    expect(alterScramCredentials.mock.calls.slice(2).map(([, deletions]) => deletions)).toEqual([
      [{ name: username, mechanism: ScramMechanisms.SCRAM_SHA_256 }],
      [{ name: username, mechanism: ScramMechanisms.SCRAM_SHA_512 }]
    ]);
  });

  test.each([
    ["has SCRAM credentials", () => describeScramCredentials.mockResolvedValue({ results: [] } as never), undefined],
    ["has ACLs", () => describeAcls.mockResolvedValue({ resources: [{}] } as never), undefined],
    ["is the admin user", () => undefined, "admin"]
  ])("refuses a username that %s without changing it", async (_case, setUp, usernameTemplate) => {
    setUp();

    await expect(KafkaProvider().create(createArgs(baseInputs, usernameTemplate))).rejects.toThrow(
      "A Kafka user with the generated username already exists"
    );
    expect(alterScramCredentials).not.toHaveBeenCalled();
    expect(createAcls).not.toHaveBeenCalled();
    expect(deleteAcls).not.toHaveBeenCalled();
  });
});

describe("KafkaProvider.revoke", () => {
  test("deletes the ACLs before the credentials and ignores a credential that is already gone", async () => {
    alterScramCredentials.mockRejectedValueOnce(new ProtocolError("RESOURCE_NOT_FOUND"));

    await expect(KafkaProvider().revoke(baseInputs, "lease-user", metadata)).resolves.toEqual({
      entityId: "lease-user"
    });

    expect(deleteAcls.mock.calls[0][1]).toEqual([expect.objectContaining({ principal: "User:lease-user" })]);
    expect(alterScramCredentials).toHaveBeenCalledTimes(2);
    expect(deleteAcls.mock.invocationCallOrder[0]).toBeLessThan(alterScramCredentials.mock.invocationCallOrder[0]);
  });
});

describe("KafkaProvider.renew", () => {
  test("returns the lease without contacting the cluster", async () => {
    await expect(KafkaProvider().renew(baseInputs, "lease-user", Date.now(), metadata)).resolves.toEqual({
      entityId: "lease-user"
    });
    expect(FakeConnection.instances).toHaveLength(0);
  });
});
