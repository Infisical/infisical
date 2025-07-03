import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum BitbucketConnectionMethod {
  ApiToken = "api-token"
}

export type TBitbucketConnection = TRootAppConnection & { app: AppConnection.Bitbucket } & {
  method: BitbucketConnectionMethod.ApiToken;
  credentials: {
    email: string;
    apiToken: string;
  };
};
