/* eslint-disable @typescript-eslint/no-empty-object-type */
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TNetlifySync = TRootSecretSync & {
  destination: SecretSync.Netlify;
  destinationConfig: {
    accountId: string;
    accountName: string;
    siteId?: string;
    siteName?: string;
  };
  connection: {
    app: AppConnection.Netlify;
    name: string;
    id: string;
  };
};
