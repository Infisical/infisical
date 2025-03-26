import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum GcpConnectionMethod {
  ServiceAccountImpersonation = "service-account-impersonation"
}

export type TGcpConnection = TRootAppConnection & { app: AppConnection.GCP } & {
  method: GcpConnectionMethod.ServiceAccountImpersonation;
  credentials: {
    serviceAccountEmail: string;
  };
};
