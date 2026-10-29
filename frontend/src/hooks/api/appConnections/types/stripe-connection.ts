import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum StripeConnectionMethod {
  OAuth = "oauth"
}

export type TStripeConnection = TRootAppConnection & { app: AppConnection.Stripe } & {
  method: StripeConnectionMethod.OAuth;
  credentials: {
    code: string;
  };
};
