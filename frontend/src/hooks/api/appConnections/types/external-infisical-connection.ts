import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ExternalInfisicalConnectionMethod {
  MachineIdentityUniversalAuth = "machine-identity-universal-auth"
}

export type TExternalInfisicalConnection = TRootAppConnection & {
  app: AppConnection.ExternalInfisical;
} & {
  method: ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth;
  credentials: {
    instanceUrl: string;
    machineIdentityClientId: string;
  };
};
