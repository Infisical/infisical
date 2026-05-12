export type TAwsGetCallerIdentityHeaders = {
  "Content-Type": string;
  Host: string;
  "X-Amz-Date": string;
  "Content-Length": number;
  "x-amz-security-token": string;
  Authorization: string;
  authorization?: string;
};

export type TGetCallerIdentityResponse = {
  GetCallerIdentityResponse: {
    GetCallerIdentityResult: {
      Account: string;
      Arn: string;
      UserId: string;
    };
    ResponseMetadata: { RequestId: string };
  };
};
