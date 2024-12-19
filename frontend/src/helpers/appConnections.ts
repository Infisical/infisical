import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faKey, faPassport, faUser } from "@fortawesome/free-solid-svg-icons";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AwsConnectionMethod,
  GitHubConnectionMethod,
  TAppConnection
} from "@app/hooks/api/appConnections/types";

export const APP_CONNECTION_MAP: Record<AppConnection, { name: string; image: string }> = {
  [AppConnection.AWS]: { name: "AWS", image: "Amazon Web Services.png" },
  [AppConnection.GitHub]: { name: "GitHub", image: "GitHub.png" }
};

export const getAppConnectionMethodDetails = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
      return { name: "GitHub App", icon: faGithub };
    case GitHubConnectionMethod.OAuth:
      return { name: "OAuth", icon: faPassport };
    case AwsConnectionMethod.AccessKey:
      return { name: "Access Key", icon: faKey };
    case AwsConnectionMethod.AssumeRole:
      return { name: "Assume Role", icon: faUser };
    default:
      throw new Error(`Unhandled App Connection Method: ${method}`);
  }
};
