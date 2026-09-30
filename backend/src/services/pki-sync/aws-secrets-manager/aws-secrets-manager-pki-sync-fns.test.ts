import { TPkiSyncWithCredentials } from "@app/services/pki-sync/pki-sync-types";

import { awsSecretsManagerPkiSyncFactory } from "./aws-secrets-manager-pki-sync-fns";

const { events, existingSecretNames } = vi.hoisted(() => ({
  events: [] as string[],
  existingSecretNames: [] as string[]
}));

vi.mock("@app/lib/crypto", () => ({ crypto: { isFipsModeEnabled: () => false } }));
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: async () => ({ region: "us-east-1", credentials: { accessKeyId: "a", secretAccessKey: "b" } })
}));
vi.mock("@aws-sdk/client-secrets-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-secrets-manager")>();
  return {
    ...actual,
    SecretsManagerClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send(command: { constructor: { name: string }; input: { Name?: string; SecretId?: string } }) {
        const { name } = command.constructor;
        if (name === "ListSecretsCommand") {
          return { SecretList: existingSecretNames.map((Name) => ({ Name, ARN: Name })) };
        }
        events.push(`${name}:${command.input.Name ?? command.input.SecretId}`);
        return {};
      }
    }
  };
});

const CERT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECRET_NAME = "infisical-550e8400e29b41d4a716446655440000";

const makeFactory = (ownedByOtherSync: string[] = []) =>
  awsSecretsManagerPkiSyncFactory({
    certificateDAL: { findById: async () => ({ id: CERT_ID }) } as never,
    certificateSyncDAL: {
      findByPkiSyncId: async () => [],
      claimExternalIdentifier: async (_syncId: string, _certId: string, name: string) => {
        events.push(`claim:${name}`);
      },
      findExternalIdentifiersInUse: async () => new Set(ownedByOtherSync),
      findByPkiSyncAndCertificate: async () => ({ id: "record-1" }),
      updateById: async () => ({}),
      removeCertificates: async () => 0,
      addCertificates: async () => [],
      updateSyncStatus: async () => {}
    } as never
  });

const pkiSync = {
  id: "sync-1",
  destination: "aws-secrets-manager",
  destinationConfig: { region: "us-east-1" },
  syncOptions: { certificateNameSchema: "infisical-{{certificateId}}", canRemoveCertificates: true },
  connection: {}
} as unknown as TPkiSyncWithCredentials;

describe("AWS Secrets Manager PKI sync destination ownership", () => {
  beforeEach(() => {
    events.length = 0;
    existingSecretNames.length = 0;
  });

  test("claims the secret name before creating the secret", async () => {
    await makeFactory().syncCertificates(pkiSync, {
      [SECRET_NAME]: { cert: "CERT", privateKey: "KEY", certificateId: CERT_ID }
    } as never);

    expect(events).toEqual([`claim:${SECRET_NAME}`, `CreateSecretCommand:${SECRET_NAME}`]);
  });

  test("does not delete managed-looking secrets owned by another sync", async () => {
    const otherSyncSecret = "infisical-aaaaaaaabbbbccccddddeeeeeeeeeeee";
    const orphanSecret = "infisical-11111111222233334444555555555555";
    existingSecretNames.push(otherSyncSecret, orphanSecret, "infisical-app-db-password");

    await makeFactory([otherSyncSecret]).syncCertificates(pkiSync, {} as never);

    expect(events).toEqual([`DeleteSecretCommand:${orphanSecret}`]);
  });
});
