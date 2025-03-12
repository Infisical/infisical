import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HumanitecConnectionMethod {
  AccessKey = "access-key"
}

export type THumanitecConnection = TRootAppConnection & { app: AppConnection.Humanitec } & {
  method: HumanitecConnectionMethod.AccessKey;
  credentials: {
    accessKeyId: string;
  };
};
