import { faGithub, IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { faKey, faPassport, faUser } from "@fortawesome/free-solid-svg-icons";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";

export const APP_CONNECTION_MAP: Record<AppConnection, { name: string; image: string }> = {
  [AppConnection.AWS]: { name: "AWS", image: "Amazon Web Services.png" },
  [AppConnection.GitHub]: { name: "GitHub", image: "GitHub.png" }
};

export const APP_CONNECTION_METHOD_MAP: Record<
  TAppConnection["method"],
  { name: string; icon: IconDefinition }
> = {
  [AwsConnectionMethod.AssumeRole]: { name: "Assume Role", icon: faUser },
  [AwsConnectionMethod.AccessKey]: { name: "Access Key", icon: faKey },
  [GitHubConnectionMethod.App]: { name: "GitHub App", icon: faGithub },
  [GitHubConnectionMethod.OAuth]: { name: "OAuth", icon: faPassport }
};
