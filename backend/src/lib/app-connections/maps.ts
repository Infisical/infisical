import { TAppConnection } from "@app/lib/app-connections/app-connection-types";

import { AppConnection } from "./app-connection-enums";
import { AwsConnectionMethod } from "./aws/aws-connection-enums";
import { GitHubConnectionMethod } from "./github/github-connection-enums";

export const APP_CONNECTION_NAME_MAP: Record<AppConnection, string> = {
  [AppConnection.AWS]: "AWS",
  [AppConnection.GitHub]: "GitHub"
};

export const APP_CONNECTION_METHOD_NAME_MAP: Record<TAppConnection["method"], string> = {
  [AwsConnectionMethod.AssumeRole]: "Assume Role",
  [AwsConnectionMethod.AccessKey]: "Access Key",
  [GitHubConnectionMethod.App]: "Github App",
  [GitHubConnectionMethod.OAuth]: "OAuth"
};
