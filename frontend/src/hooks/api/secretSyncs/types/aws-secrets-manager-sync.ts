import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TAwsSecretsManagerSync = TRootSecretSync & {
  destination: SecretSync.AWSSecretsManager;
  destinationConfig:
    | {
        mappingBehavior: AwsSecretsManagerSyncMappingBehavior.OneToOne;
        region: string;
      }
    | {
        region: string;
        mappingBehavior: AwsSecretsManagerSyncMappingBehavior.ManyToOne;
        secretName: string;
      };
  connection: {
    app: AppConnection.AWS;
    name: string;
    id: string;
  };
  syncOptions: RootSyncOptions & {
    keyId?: string;
    tags?: { key: string; value?: string }[];
    syncSecretMetadataAsTags?: boolean;
  };
};
export enum AwsSecretsManagerSyncMappingBehavior {
  OneToOne = "one-to-one",
  ManyToOne = "many-to-one"
}
