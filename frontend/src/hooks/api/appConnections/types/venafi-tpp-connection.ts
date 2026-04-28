import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum VenafiTppConnectionMethod {
  OAuth = "oauth"
}

export type TVenafiTppConnection = TRootAppConnection & {
  app: AppConnection.VenafiTpp;
  method: VenafiTppConnectionMethod.OAuth;
  credentials: {
    tppUrl: string;
    clientId: string;
    username: string;
  };
};
