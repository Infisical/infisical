import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ExternalInfisicalConnectionMethod {
  MachineIdentity = "machine-identity"
}

export type TExternalInfisicalConnection = TRootAppConnection & {
  app: AppConnection.ExternalInfisical;
} & {
  method: ExternalInfisicalConnectionMethod.MachineIdentity;
  credentials: {
    instanceUrl: string;
    machineIdentityClientId: string;
  };
};
