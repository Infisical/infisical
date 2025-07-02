import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum BitBucketConnectionMethod {
  ApiToken = "api-token"
}

export type TBitBucketConnection = TRootAppConnection & { app: AppConnection.BitBucket } & {
  method: BitBucketConnectionMethod.ApiToken;
  credentials: {
    email: string;
    apiToken: string;
  };
};
