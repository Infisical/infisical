import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OCIConnectionMethod {
  AccessKey = "access-key"
}

export type TOCIConnection = TRootAppConnection & { app: AppConnection.OCI } & {
  method: OCIConnectionMethod.AccessKey;
  credentials: {
    userOcid: string;
    tenancyOcid: string;
    region: string;
    fingerprint: string;
    privateKey: string;
  };
};
