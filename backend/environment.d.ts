export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EMAIL_TOKEN_LIFETIME: string;
      ENCRYPTION_KEY: string;
      JWT_AUTH_LIFETIME: string;
      JWT_AUTH_SECRET: string;
      JWT_REFRESH_LIFETIME: string;
      JWT_REFRESH_SECRET: string;
			JWT_SERVICE_SECRET: string;
			JWT_SIGNUP_LIFETIME: string;
			JWT_SIGNUP_SECRET: string;
      MONGO_URL: string;
      NODE_ENV: 'development' | 'staging' | 'testing' | 'production';
      OAUTH_CLIENT_SECRET_HEROKU: string;
      OAUTH_TOKEN_URL_HEROKU: string;
			POSTHOG_HOST: string;
			POSTHOG_PROJECT_API_KEY: string;
      PRIVATE_KEY: string;
      PUBLIC_KEY: string;
      SENTRY_DSN: string;
      SITE_URL: string;
      SMTP_HOST: string;
      SMTP_NAME: string;
      SMTP_PASSWORD: string;
      SMTP_USERNAME: string;
      STRIPE_PRODUCT_CARD_AUTH: string;
      STRIPE_PRODUCT_PRO: string;
      STRIPE_PRODUCT_STARTER: string;
      STRIPE_PUBLISHABLE_KEY: string;
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_SECRET: string;
    }
  }
}
