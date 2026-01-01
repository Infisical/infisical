import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ConvexConnectionMethod {
  AdminKey = "admin-key"
}

export type TConvexConnection = TRootAppConnection & {
  app: AppConnection.Convex;
  method: ConvexConnectionMethod.AdminKey;
  credentials: {
    adminKey: string;
  };
};
