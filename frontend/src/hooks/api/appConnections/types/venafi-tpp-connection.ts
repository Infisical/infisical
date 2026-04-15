import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum VenafiTppConnectionMethod {
  UsernamePassword = "username-password"
}

export type TVenafiTppConnection = TRootAppConnection & {
  app: AppConnection.VenafiTpp;
  method: VenafiTppConnectionMethod.UsernamePassword;
  credentials: {
    tppUrl: string;
    clientId: string;
    username: string;
  };
};
