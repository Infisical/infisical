import { GITLAB_URL } from "../variables";

import InfisicalClient from "infisical-node";

export const client = new InfisicalClient({
  token: process.env.INFISICAL_TOKEN!
});

export const getPort = async () => (await client.getSecret("PORT")).secretValue || 4000;
export const getEncryptionKey = async () => {
  const secretValue = (await client.getSecret("ENCRYPTION_KEY")).secretValue;
  return secretValue === "" ? undefined : secretValue;
};
export const getRootEncryptionKey = async () => {
  const secretValue = (await client.getSecret("ROOT_ENCRYPTION_KEY")).secretValue;
  return secretValue === "" ? undefined : secretValue;
};
export const getInviteOnlySignup = async () =>
  (await client.getSecret("INVITE_ONLY_SIGNUP")).secretValue === "true";
export const getSaltRounds = async () =>
  parseInt((await client.getSecret("SALT_ROUNDS")).secretValue) || 10;
export const getAuthSecret = async () =>
  (await client.getSecret("JWT_AUTH_SECRET")).secretValue ??
  (await client.getSecret("AUTH_SECRET")).secretValue;
export const getJwtAuthLifetime = async () =>
  (await client.getSecret("JWT_AUTH_LIFETIME")).secretValue || "10d";
export const getJwtMfaLifetime = async () =>
  (await client.getSecret("JWT_MFA_LIFETIME")).secretValue || "5m";
export const getJwtRefreshLifetime = async () =>
  (await client.getSecret("JWT_REFRESH_LIFETIME")).secretValue || "90d";
export const getJwtServiceSecret = async () =>
  (await client.getSecret("JWT_SERVICE_SECRET")).secretValue; // TODO: deprecate (related to ST V1)
export const getJwtSignupLifetime = async () =>
  (await client.getSecret("JWT_SIGNUP_LIFETIME")).secretValue || "15m";
export const getJwtProviderAuthLifetime = async () =>
  (await client.getSecret("JWT_PROVIDER_AUTH_LIFETIME")).secretValue || "15m";
export const getMongoURL = async () => (await client.getSecret("MONGO_URL")).secretValue;
export const getNodeEnv = async () =>
  (await client.getSecret("NODE_ENV")).secretValue || "production";
export const getVerboseErrorOutput = async () =>
  (await client.getSecret("VERBOSE_ERROR_OUTPUT")).secretValue === "true" && true;
export const getLokiHost = async () => (await client.getSecret("LOKI_HOST")).secretValue;
export const getClientIdAzure = async () => (await client.getSecret("CLIENT_ID_AZURE")).secretValue;
export const getClientIdHeroku = async () =>
  (await client.getSecret("CLIENT_ID_HEROKU")).secretValue;
export const getClientIdVercel = async () =>
  (await client.getSecret("CLIENT_ID_VERCEL")).secretValue;
export const getClientIdNetlify = async () =>
  (await client.getSecret("CLIENT_ID_NETLIFY")).secretValue;
export const getClientIdGitHub = async () =>
  (await client.getSecret("CLIENT_ID_GITHUB")).secretValue;
export const getClientIdGitLab = async () =>
  (await client.getSecret("CLIENT_ID_GITLAB")).secretValue;
export const getClientIdBitBucket = async () =>
  (await client.getSecret("CLIENT_ID_BITBUCKET")).secretValue;
export const getClientIdGCPSecretManager = async () =>
  (await client.getSecret("CLIENT_ID_GCP_SECRET_MANAGER")).secretValue;
export const getClientSecretAzure = async () =>
  (await client.getSecret("CLIENT_SECRET_AZURE")).secretValue;
export const getClientSecretHeroku = async () =>
  (await client.getSecret("CLIENT_SECRET_HEROKU")).secretValue;
export const getClientSecretVercel = async () =>
  (await client.getSecret("CLIENT_SECRET_VERCEL")).secretValue;
export const getClientSecretNetlify = async () =>
  (await client.getSecret("CLIENT_SECRET_NETLIFY")).secretValue;
export const getClientSecretGitHub = async () =>
  (await client.getSecret("CLIENT_SECRET_GITHUB")).secretValue;
export const getClientSecretGitLab = async () =>
  (await client.getSecret("CLIENT_SECRET_GITLAB")).secretValue;
export const getClientSecretBitBucket = async () =>
  (await client.getSecret("CLIENT_SECRET_BITBUCKET")).secretValue;
export const getClientSecretGCPSecretManager = async () =>
  (await client.getSecret("CLIENT_SECRET_GCP_SECRET_MANAGER")).secretValue;
export const getClientSlugVercel = async () =>
  (await client.getSecret("CLIENT_SLUG_VERCEL")).secretValue;

export const getClientIdGoogleLogin = async () =>
  (await client.getSecret("CLIENT_ID_GOOGLE_LOGIN")).secretValue;
export const getClientSecretGoogleLogin = async () =>
  (await client.getSecret("CLIENT_SECRET_GOOGLE_LOGIN")).secretValue;
export const getClientIdGitHubLogin = async () =>
  (await client.getSecret("CLIENT_ID_GITHUB_LOGIN")).secretValue;
export const getClientSecretGitHubLogin = async () =>
  (await client.getSecret("CLIENT_SECRET_GITHUB_LOGIN")).secretValue;
export const getClientIdGitLabLogin = async () =>
  (await client.getSecret("CLIENT_ID_GITLAB_LOGIN")).secretValue;
export const getClientSecretGitLabLogin = async () =>
  (await client.getSecret("CLIENT_SECRET_GITLAB_LOGIN")).secretValue;
export const getUrlGitLabLogin = async () =>
  (await client.getSecret("URL_GITLAB_LOGIN")).secretValue || GITLAB_URL;

export const getAwsCloudWatchLog = async () => {
  const logGroupName =
    (await client.getSecret("AWS_CLOUDWATCH_LOG_GROUP_NAME")).secretValue || "infisical-log-stream";
  const region = (await client.getSecret("AWS_CLOUDWATCH_LOG_REGION")).secretValue;
  const accessKeyId = (await client.getSecret("AWS_CLOUDWATCH_LOG_ACCESS_KEY_ID")).secretValue;
  const accessKeySecret = (await client.getSecret("AWS_CLOUDWATCH_LOG_ACCESS_KEY_SECRET"))
    .secretValue;
  const interval = parseInt(
    (await client.getSecret("AWS_CLOUDWATCH_LOG_INTERVAL")).secretValue || 1000,
    10
  );
  if (!region || !accessKeyId || !accessKeySecret) return;
  return { logGroupName, region, accessKeySecret, accessKeyId, interval };
};

export const getPostHogHost = async () =>
  (await client.getSecret("POSTHOG_HOST")).secretValue || "https://app.posthog.com";
export const getPostHogProjectApiKey = async () =>
  (await client.getSecret("POSTHOG_PROJECT_API_KEY")).secretValue ||
  "phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE";
export const getSentryDSN = async () => (await client.getSecret("SENTRY_DSN")).secretValue;
export const getSiteURL = async () => (await client.getSecret("SITE_URL")).secretValue;
export const getSmtpHost = async () => (await client.getSecret("SMTP_HOST")).secretValue;
export const getSmtpSecure = async () =>
  (await client.getSecret("SMTP_SECURE")).secretValue === "true" || false;
export const getSmtpPort = async () =>
  parseInt((await client.getSecret("SMTP_PORT")).secretValue) || 587;
export const getSmtpUsername = async () => (await client.getSecret("SMTP_USERNAME")).secretValue;
export const getSmtpPassword = async () => (await client.getSecret("SMTP_PASSWORD")).secretValue;
export const getSmtpFromAddress = async () =>
  (await client.getSecret("SMTP_FROM_ADDRESS")).secretValue;
export const getSmtpFromName = async () =>
  (await client.getSecret("SMTP_FROM_NAME")).secretValue || "Infisical";

export const getSecretScanningWebhookProxy = async () =>
  (await client.getSecret("SECRET_SCANNING_WEBHOOK_PROXY")).secretValue;
export const getSecretScanningWebhookSecret = async () =>
  (await client.getSecret("SECRET_SCANNING_WEBHOOK_SECRET")).secretValue;
export const getSecretScanningGitAppId = async () =>
  (await client.getSecret("SECRET_SCANNING_GIT_APP_ID")).secretValue;
export const getSecretScanningPrivateKey = async () =>
  (await client.getSecret("SECRET_SCANNING_PRIVATE_KEY")).secretValue;

export const getRedisUrl = async () => (await client.getSecret("REDIS_URL")).secretValue;
export const getIsInfisicalCloud = async () =>
  (await client.getSecret("INFISICAL_CLOUD")).secretValue === "true";

export const getLicenseKey = async () => {
  const secretValue = (await client.getSecret("LICENSE_KEY")).secretValue;
  return secretValue === "" ? undefined : secretValue;
};
export const getLicenseServerKey = async () => {
  const secretValue = (await client.getSecret("LICENSE_SERVER_KEY")).secretValue;
  return secretValue === "" ? undefined : secretValue;
};
export const getLicenseServerUrl = async () =>
  (await client.getSecret("LICENSE_SERVER_URL")).secretValue || "https://portal.infisical.com";

export const getTelemetryEnabled = async () =>
  (await client.getSecret("TELEMETRY_ENABLED")).secretValue !== "false" && true;
export const getLoopsApiKey = async () => (await client.getSecret("LOOPS_API_KEY")).secretValue;
export const getSmtpConfigured = async () =>
  (await client.getSecret("SMTP_HOST")).secretValue == "" ||
  (await client.getSecret("SMTP_HOST")).secretValue == undefined
    ? false
    : true;
export const getHttpsEnabled = async () => {
  if ((await getNodeEnv()) != "production") {
    // no https for anything other than prod
    return false;
  }

  if (
    (await client.getSecret("HTTPS_ENABLED")).secretValue == undefined ||
    (await client.getSecret("HTTPS_ENABLED")).secretValue == ""
  ) {
    // default when no value present
    return true;
  }

  return (await client.getSecret("HTTPS_ENABLED")).secretValue === "true" && true;
};
