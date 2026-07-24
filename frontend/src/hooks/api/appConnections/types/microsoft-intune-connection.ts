import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum MicrosoftIntuneConnectionMethod {
  ClientSecret = "client-secret"
}

export type TMicrosoftIntuneConnection = TRootAppConnection & {
  app: AppConnection.MicrosoftIntune;
} & {
  method: MicrosoftIntuneConnectionMethod.ClientSecret;
  credentials: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  };
};
