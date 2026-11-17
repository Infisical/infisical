import { getConfig } from "@app/lib/config/env";

// The principal Infisical acts as when it assumes a customer's role. Undefined lets the AWS SDK use its default
// credential chain, which is the instance profile, ECS task role, or EKS IRSA / Pod Identity when hosted on AWS.
export const getInfisicalAwsCredentials = () => {
  const appCfg = getConfig();
  if (appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID && appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID,
      secretAccessKey: appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
    };
  }

  return undefined;
};
