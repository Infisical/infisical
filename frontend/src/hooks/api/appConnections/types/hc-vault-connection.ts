import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HCVaultConnectionMethod {
  AccessToken = "access-token",
  AppRole = "app-role"
}

export type THCVaultConnection = TRootAppConnection & { app: AppConnection.HCVault } & (
    | {
        method: HCVaultConnectionMethod.AccessToken;
        credentials: {
          instanceUrl: string;
          namespace?: string;
          accessToken: string;
        };
      }
    | {
        method: HCVaultConnectionMethod.AppRole;
        credentials: {
          instanceUrl: string;
          namespace?: string;
          roleId: string;
          secretId: string;
        };
      }
  );
