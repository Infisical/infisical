/* eslint-disable max-classes-per-file */
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AwsConnectionMethod } from "@app/services/app-connection/aws/aws-connection-enums";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { awsCertificateManagerPkiSyncFactory } from "@app/services/pki-sync/aws-certificate-manager/aws-certificate-manager-pki-sync-fns";
import { awsElasticLoadBalancerPkiSyncFactory } from "@app/services/pki-sync/aws-elastic-load-balancer/aws-elastic-load-balancer-pki-sync-fns";

import { createAcmClient } from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-client";
import { AwsPcaCertificateAuthorityFns } from "./aws-pca/aws-pca-certificate-authority-fns";
import { CaStatus } from "./certificate-authority-enums";
import { route53GetHostedZone } from "./dns-providers/route53";

const sts = vi.hoisted(() => ({
  externalIds: [] as (string | undefined)[],
  rejectedExternalIds: [] as string[]
}));
const credentials = vi.hoisted(() => ({ roleArn: "arn:aws:iam::123456789012:role/infisical" }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: {
    isFipsModeEnabled: () => false,
    nativeCrypto: { randomUUID: () => "session" }
  }
}));
vi.mock("@app/lib/aws/hashing", () => ({
  CustomAWSHasher: function CustomAWSHasher() {}
}));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (connection: unknown) => connection,
  decryptAppConnectionCredentials: async () => credentials
}));
vi.mock("@aws-sdk/client-sts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-sts")>();
  return {
    ...actual,
    STSClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send(command: { input: { ExternalId?: string } }) {
        sts.externalIds.push(command.input.ExternalId);
        if (command.input.ExternalId && sts.rejectedExternalIds.includes(command.input.ExternalId)) {
          throw new Error("not authorized to perform: sts:AssumeRole");
        }
        return {
          Credentials: {
            AccessKeyId: "access-key",
            SecretAccessKey: "secret-key",
            SessionToken: "token"
          }
        };
      }
    }
  };
});
vi.mock("@aws-sdk/client-route-53", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-route-53")>();
  return {
    ...actual,
    Route53Client: class {
      // eslint-disable-next-line class-methods-use-this
      async send() {
        return {};
      }
    }
  };
});
vi.mock("@aws-sdk/client-acm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-acm")>();
  return {
    ...actual,
    ACMClient: class {
      constructor() {
        throw new Error("stop after the client is built");
      }
    }
  };
});
vi.mock("@aws-sdk/client-acm-pca", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-acm-pca")>();
  return {
    ...actual,
    ACMPCAClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send() {
        throw new Error("stop after the client is built");
      }
    }
  };
});

const connection = {
  id: "conn-1",
  app: AppConnection.AWS,
  method: AwsConnectionMethod.AssumeRole,
  credentials,
  orgId: "org-1",
  projectId: "proj-1",
  version: 2
} as TAwsConnectionConfig & { id: string };

const appConnectionDAL = { findById: async () => connection } as never;
const kmsDataKeyService = {} as never;
// No platform AWS credentials, as the env this test mocks has none.
const instanceConfigService = { getOverridableEnv: async () => ({}) } as never;
const stopAfterClientIsBuilt = async () => {
  throw new Error("stop after the client is built");
};
const pkiSync = {
  id: "sync-1",
  connection: { id: connection.id },
  destinationConfig: { region: AWSRegion.US_EAST_1, listeners: [] }
} as never;

const buildClients: Record<
  string,
  {
    clientsBuilt: number;
    buildClient: () => Promise<void>;
  }
> = {
  "AWS Private CA": {
    clientsBuilt: 1,
    buildClient: async () => {
      const fns = AwsPcaCertificateAuthorityFns({
        appConnectionDAL,
        appConnectionService: {
          validateAppConnectionUsageById: async () => {}
        },
        kmsDataKeyService,
        instanceConfigService
      } as never);
      await expect(
        fns.createCertificateAuthority({
          name: "ca",
          projectId: "proj-1",
          status: CaStatus.ACTIVE,
          configuration: {
            appConnectionId: connection.id,
            certificateAuthorityArn: "arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/ca",
            region: AWSRegion.US_EAST_1
          },
          actor: {}
        } as never)
      ).rejects.toThrow("stop after the client is built");
    }
  },
  "AWS ACM Public CA": {
    clientsBuilt: 1,
    buildClient: async () => {
      await expect(
        createAcmClient({
          appConnectionId: connection.id,
          region: AWSRegion.US_EAST_1,
          appConnectionDAL,
          kmsDataKeyService,
          instanceConfigService
        })
      ).rejects.toThrow("stop after the client is built");
    }
  },
  "Route 53": {
    clientsBuilt: 1,
    buildClient: async () => {
      await route53GetHostedZone(connection, "zone-1", instanceConfigService);
    }
  },
  "AWS Certificate Manager sync": {
    clientsBuilt: 1,
    buildClient: async () => {
      const fns = awsCertificateManagerPkiSyncFactory({
        appConnectionDAL,
        kmsDataKeyService,
        instanceConfigService,
        certificateSyncDAL: { findByPkiSyncId: stopAfterClientIsBuilt },
        certificateDAL: {}
      } as never);
      await expect(fns.removeCertificates(pkiSync, ["cert"])).rejects.toThrow("stop after the client is built");
    }
  },
  "AWS Elastic Load Balancer sync": {
    clientsBuilt: 2,
    buildClient: async () => {
      const fns = awsElasticLoadBalancerPkiSyncFactory({
        appConnectionDAL,
        kmsDataKeyService,
        instanceConfigService,
        certificateSyncDAL: {
          findByPkiSyncId: async () => [{ certificateId: "cert-1", externalIdentifier: "arn" }]
        },
        certificateDAL: {}
      } as never);
      await expect(
        fns.removeCertificates(pkiSync, ["cert"], {
          certificateMap: { cert: { certificateId: "cert-1" } } as never
        })
      ).rejects.toThrow("stop after the client is built");
    }
  }
};

describe.each(Object.entries(buildClients))("%s External ID", (_, { clientsBuilt, buildClient }) => {
  beforeEach(() => {
    sts.externalIds = [];
    sts.rejectedExternalIds = [];
  });

  test("tries the organization ID first", async () => {
    await buildClient();

    expect(sts.externalIds).toEqual(Array(clientsBuilt).fill("org-1"));
  });

  test("falls back to the project ID", async () => {
    sts.rejectedExternalIds = ["org-1"];

    await buildClient();

    expect(sts.externalIds).toEqual(Array(clientsBuilt).fill(["org-1", "proj-1"]).flat());
  });
});
