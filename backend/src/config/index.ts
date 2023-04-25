import infisical from 'infisical-node';
export const getPort = () => infisical.get('PORT')! || 4000;
export const getInviteOnlySignup = () => infisical.get('INVITE_ONLY_SIGNUP')! == undefined ? false : infisical.get('INVITE_ONLY_SIGNUP');
export const getEncryptionKey = () => infisical.get('ENCRYPTION_KEY')!;
export const getSaltRounds = () => parseInt(infisical.get('SALT_ROUNDS')!) || 10;
export const getJwtAuthLifetime = () => infisical.get('JWT_AUTH_LIFETIME')! || '10d';
export const getJwtAuthSecret = () => infisical.get('JWT_AUTH_SECRET')!;
export const getJwtMfaLifetime = () => infisical.get('JWT_MFA_LIFETIME')! || '5m';
export const getJwtMfaSecret = () => infisical.get('JWT_MFA_LIFETIME')! || '5m';
export const getJwtRefreshLifetime = () => infisical.get('JWT_REFRESH_LIFETIME')! || '90d';
export const getJwtRefreshSecret = () => infisical.get('JWT_REFRESH_SECRET')!;
export const getJwtServiceSecret = () => infisical.get('JWT_SERVICE_SECRET')!;
export const getJwtSignupLifetime = () => infisical.get('JWT_SIGNUP_LIFETIME')! || '15m';
export const getJwtSignupSecret = () => infisical.get('JWT_SIGNUP_SECRET')!;
export const getJwtProviderAuthSecret = () => infisical.get('JWT_PROVIDER_AUTH_SECRET')!;
export const getJwtProviderAuthLifetime = () => infisical.get('JWT_PROVIDER_AUTH_LIFETIME')! || '15m';
export const getMongoURL = () => infisical.get('MONGO_URL')!;
export const getNodeEnv = () => infisical.get('NODE_ENV')! || 'production';
export const getVerboseErrorOutput = () => infisical.get('VERBOSE_ERROR_OUTPUT')! === 'true' && true;
export const getLokiHost = () => infisical.get('LOKI_HOST')!;
export const getClientIdAzure = () => infisical.get('CLIENT_ID_AZURE')!;
export const getClientIdHeroku = () => infisical.get('CLIENT_ID_HEROKU')!;
export const getClientIdVercel = () => infisical.get('CLIENT_ID_VERCEL')!;
export const getClientIdNetlify = () => infisical.get('CLIENT_ID_NETLIFY')!;
export const getClientIdGitHub = () => infisical.get('CLIENT_ID_GITHUB')!;
export const getClientIdGitLab = () => infisical.get('CLIENT_ID_GITLAB')!;
export const getClientSecretAzure = () => infisical.get('CLIENT_SECRET_AZURE')!;
export const getClientSecretHeroku = () => infisical.get('CLIENT_SECRET_HEROKU')!;
export const getClientSecretVercel = () => infisical.get('CLIENT_SECRET_VERCEL')!;
export const getClientSecretNetlify = () => infisical.get('CLIENT_SECRET_NETLIFY')!;
export const getClientSecretGitHub = () => infisical.get('CLIENT_SECRET_GITHUB')!;
export const getClientSecretGitLab = () => infisical.get('CLIENT_SECRET_GITLAB')!;
export const getClientSlugVercel = () => infisical.get('CLIENT_SLUG_VERCEL')!;
export const getPostHogHost = () => infisical.get('POSTHOG_HOST')! || 'https://app.posthog.com';
export const getPostHogProjectApiKey = () => infisical.get('POSTHOG_PROJECT_API_KEY')! || 'phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE';
export const getSentryDSN = () => infisical.get('SENTRY_DSN')!;
export const getSessionSecret = () => infisical.get('SESSION_SECRET')!;
export const getSiteURL = () => infisical.get('SITE_URL')!;
export const getSmtpHost = () => infisical.get('SMTP_HOST')!;
export const getSmtpSecure = () => infisical.get('SMTP_SECURE')! === 'true' || false;
export const getSmtpPort = () => parseInt(infisical.get('SMTP_PORT')!) || 587;
export const getSmtpUsername = () => infisical.get('SMTP_USERNAME')!;
export const getSmtpPassword = () => infisical.get('SMTP_PASSWORD')!;
export const getSmtpFromAddress = () => infisical.get('SMTP_FROM_ADDRESS')!;
export const getSmtpFromName = () => infisical.get('SMTP_FROM_NAME')! || 'Infisical';
export const getStripeProductStarter = () => infisical.get('STRIPE_PRODUCT_STARTER')!;
export const getStripeProductPro = () => infisical.get('STRIPE_PRODUCT_PRO')!;
export const getStripeProductTeam = () => infisical.get('STRIPE_PRODUCT_TEAM')!;
export const getStripePublishableKey = () => infisical.get('STRIPE_PUBLISHABLE_KEY')!;
export const getStripeSecretKey = () => infisical.get('STRIPE_SECRET_KEY')!;
export const getStripeWebhookSecret = () => infisical.get('STRIPE_WEBHOOK_SECRET')!;
export const getTelemetryEnabled = () => infisical.get('TELEMETRY_ENABLED')! !== 'false' && true;
export const getLoopsApiKey = () => infisical.get('LOOPS_API_KEY')!;
export const getSmtpConfigured = () => infisical.get('SMTP_HOST') == '' || infisical.get('SMTP_HOST') == undefined ? false : true
export const getHttpsEnabled = () => {
  if (getNodeEnv() != "production") {
    // no https for anything other than prod
    return false
  }

  if (infisical.get('HTTPS_ENABLED') == undefined || infisical.get('HTTPS_ENABLED') == "") {
    // default when no value present
    return true
  }

  return infisical.get('HTTPS_ENABLED') === 'true' && true
}