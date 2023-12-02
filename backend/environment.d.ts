export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      ENCRYPTION_KEY: string;
      SALT_ROUNDS: string;
      JWT_AUTH_LIFETIME: string;
      JWT_AUTH_SECRET: string;
      JWT_REFRESH_LIFETIME: string;
      JWT_REFRESH_SECRET: string;
			JWT_SERVICE_SECRET: string;
			JWT_SIGNUP_LIFETIME: string;
			JWT_SIGNUP_SECRET: string;
      MONGO_URL: string;
      NODE_ENV: "development" | "staging" | "testing" | "production";
      VERBOSE_ERROR_OUTPUT: string;
      LOKI_HOST: string;
      CLIENT_ID_HEROKU: string;
      CLIENT_ID_VERCEL: string;
      CLIENT_ID_NETLIFY: string;
      CLIENT_ID_GITHUB: string;
      CLIENT_ID_GITLAB: string;
      CLIENT_SECRET_HEROKU: string;
      CLIENT_SECRET_VERCEL: string;
      CLIENT_SECRET_NETLIFY: string;
      CLIENT_SECRET_GITHUB: string;
      CLIENT_SECRET_GITLAB: string;
      CLIENT_SLUG_VERCEL: string;
			POSTHOG_HOST: string;
			POSTHOG_PROJECT_API_KEY: string;
      SENTRY_DSN: string;
      SITE_URL: string;
      SMTP_HOST: string;
      SMTP_SECURE: string;
      SMTP_PORT: string;
      SMTP_USERNAME: string;
      SMTP_PASSWORD: string;
      SMTP_FROM_ADDRESS: string;
      SMTP_FROM_NAME: string;
      TELEMETRY_ENABLED: string;
      LICENSE_KEY: string;
    }
  }
}
