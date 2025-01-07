export {};

declare global {
  interface Window {
    __INFISICAL_RUNTIME_ENV__?: {
      CAPTCHA_SITE_KEY?: string;
      POSTHOG_API_KEY?: string;
      INTERCOM_ID?: string;
      TELEMETRY_CAPTURING_ENABLED: string;
    };
  }
}
