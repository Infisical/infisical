import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum GcpConnectionMethod {
  ServiceAccountImpersonation = "service-account-impersonation",
  WorkloadIdentityFederation = "workload-identity-federation"
}

export type TGcpConnection = TRootAppConnection & { app: AppConnection.GCP } & (
    | {
        method: GcpConnectionMethod.ServiceAccountImpersonation;
        credentials: {
          serviceAccountEmail: string;
        };
      }
    | {
        method: GcpConnectionMethod.WorkloadIdentityFederation;
        credentials: {
          workloadIdentityProvider: string;
          serviceAccountEmail?: string;
          federatedCredential?: {
            issuerUrl: string | null;
            subjectIdentifier: string;
            audience: string;
          };
        };
      }
  );
