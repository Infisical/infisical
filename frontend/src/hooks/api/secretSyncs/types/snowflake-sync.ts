import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TSnowflakeSync = TRootSecretSync & {
  destination: SecretSync.Snowflake;
  destinationConfig: {
    database: string;
    schema: string;
  };
  connection: {
    app: AppConnection.Snowflake;
    name: string;
    id: string;
  };
};
