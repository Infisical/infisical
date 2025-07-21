import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TBitbucketSync = TRootSecretSync & {
  destination: SecretSync.Bitbucket;
  destinationConfig: {
    workspaceSlug: string;
    repositorySlug: string;
    environmentId?: string;
  };
  connection: {
    app: AppConnection.Bitbucket;
    name: string;
    id: string;
  };
};
