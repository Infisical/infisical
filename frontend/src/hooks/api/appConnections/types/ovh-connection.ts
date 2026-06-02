import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OVHConnectionMethod {
  Certificate = "certificate"
}

export type TOvhConnection = TRootAppConnection & { app: AppConnection.OVH } & {
  method: OVHConnectionMethod.Certificate;
  credentials: {
    privateKey: string;
    certificate: string;
    okmsDomain: string;
    okmsId: string;
  };
};
