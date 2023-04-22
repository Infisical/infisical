import infisical from 'infisical-node';

export const getPort = async () => await infisical.get('PORT')! || 4000;
export const getInviteOnlySignup = async () => await infisical.get('INVITE_ONLY_SIGNUP')! == undefined ? false : await infisical.get('INVITE_ONLY_SIGNUP');
export const getEncryptionKey = async () => await infisical.get('ENCRYPTION_KEY')!;
export const getSaltRounds = async () => parseInt(await infisical.get('SALT_ROUNDS')!) || 10;
export const getJwtAuthLifetime = async () => await infisical.get('JWT_AUTH_LIFETIME')! || '10d';
export const getJwtAuthSecret = async () => await infisical.get('JWT_AUTH_SECRET')!;
export const getJwtMfaLifetime = async () => await infisical.get('JWT_MFA_LIFETIME')! || '5m';
export const getJwtMfaSecret = async () => await infisical.get('JWT_MFA_LIFETIME')! || '5m';
export const getJwtRefreshLifetime = async () => await infisical.get('JWT_REFRESH_LIFETIME')! || '90d';
export const getJwtRefreshSecret = async () => await infisical.get('JWT_REFRESH_SECRET')!;
export const getJwtServiceSecret = async () => await infisical.get('JWT_SERVICE_SECRET')!;
export const getJwtSignupLifetime = async () => await infisical.get('JWT_SIGNUP_LIFETIME')! || '15m';
export const getJwtSignupSecret = async () => await infisical.get('JWT_SIGNUP_SECRET')!;
export const getMongoURL = async () => await infisical.get('MONGO_URL')!;
export const getNodeEnv = async () => await infisical.get('NODE_ENV')! || 'production';
export const getVerboseErrorOutput = async () => await infisical.get('VERBOSE_ERROR_OUTPUT')! === 'true' && true;
export const getLokiHost = async () => await infisical.get('LOKI_HOST')!;
export const getClientIdAzure = async () => await infisical.get('CLIENT_ID_AZURE')!;
export const getClientIdHeroku = async () => await infisical.get('CLIENT_ID_HEROKU')!;
export const getClientIdVercel = async () => await infisical.get('CLIENT_ID_VERCEL')!;
export const getClientIdNetlify = async () => await infisical.get('CLIENT_ID_NETLIFY')!;
export const getClientIdGitHub = async () => await infisical.get('CLIENT_ID_GITHUB')!;
export const getClientIdGitLab = async () => await infisical.get('CLIENT_ID_GITLAB')!;
export const getClientSecretAzure = async () => await infisical.get('CLIENT_SECRET_AZURE')!;
export const getClientSecretHeroku = async () => await infisical.get('CLIENT_SECRET_HEROKU')!;
export const getClientSecretVercel = async () => await infisical.get('CLIENT_SECRET_VERCEL')!;
export const getClientSecretNetlify = async () => await infisical.get('CLIENT_SECRET_NETLIFY')!;
export const getClientSecretGitHub = async () => await infisical.get('CLIENT_SECRET_GITHUB')!;
export const getClientSecretGitLab = async () => await infisical.get('CLIENT_SECRET_GITLAB')!;
export const getClientSlugVercel = async () => await infisical.get('CLIENT_SLUG_VERCEL')!;
export const getPostHogHost = async () => await infisical.get('POSTHOG_HOST')! || 'https://app.posthog.com';
export const getPostHogProjectApiKey = async () => await infisical.get('POSTHOG_PROJECT_API_KEY')! || 'phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE';
export const getSentryDSN = async () => await infisical.get('SENTRY_DSN')!;
export const getSiteURL = async () => await infisical.get('SITE_URL')!;
export const getSmtpHost = async () => await infisical.get('SMTP_HOST')!;
export const getSmtpSecure = async () => await infisical.get('SMTP_SECURE')! === 'true' || false;
export const getSmtpPort = async () => parseInt(await infisical.get('SMTP_PORT')!) || 587;
export const getSmtpUsername = async () => await infisical.get('SMTP_USERNAME')!;
export const getSmtpPassword = async () => await infisical.get('SMTP_PASSWORD')!;
export const getSmtpFromAddress = async () => await infisical.get('SMTP_FROM_ADDRESS')!;
export const getSmtpFromName = async () => await infisical.get('SMTP_FROM_NAME')! || 'Infisical';
export const getStripeProductStarter = async () => await infisical.get('STRIPE_PRODUCT_STARTER')!;
export const getStripeProductPro = async () => await infisical.get('STRIPE_PRODUCT_PRO')!;
export const getStripeProductTeam = async () => await infisical.get('STRIPE_PRODUCT_TEAM')!;
export const getStripePublishableKey = async () => await infisical.get('STRIPE_PUBLISHABLE_KEY')!;
export const getStripeSecretKey = async () => await infisical.get('STRIPE_SECRET_KEY')!;
export const getStripeWebhookSecret = async () => await infisical.get('STRIPE_WEBHOOK_SECRET')!;
export const getTelemetryEnabled = async () => await infisical.get('TELEMETRY_ENABLED')! !== 'false' && true;
export const getLoopsApiKey = async () => await infisical.get('LOOPS_API_KEY')!;
export const getSmtpConfigured = async () => await infisical.get('SMTP_HOST') == '' || await infisical.get('SMTP_HOST') == undefined ? false : true
export const getHttpsEnabled = async () => {
  if ((await getNodeEnv()) != "production") {
    // no https for anything other than prod
    return false
  }

  if ((await infisical.get('HTTPS_ENABLED')) == undefined || (await infisical.get('HTTPS_ENABLED')) == "") {
    // default when no value present
    return true
  }

  return (await infisical.get('HTTPS_ENABLED')) === 'true' && true
}