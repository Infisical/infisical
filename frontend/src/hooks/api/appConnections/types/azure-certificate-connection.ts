import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AzureCertificateConnectionMethod {
  OAuth = "oauth",
  ClientSecret = "client-secret"
}

export type TAzureCertificateConnection = TRootAppConnection & {
  app: AppConnection.AzureCertificate;
} & (
    | {
        method: AzureCertificateConnectionMethod.OAuth;
        credentials: {
          code: string;
          tenantId: string;
        };
      }
    | {
        method: AzureCertificateConnectionMethod.ClientSecret;
        credentials: {
          clientSecret: string;
          clientId: string;
          tenantId: string;
        };
      }
  );
