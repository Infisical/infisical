const ENV = process.env.NEXT_PUBLIC_ENV! || "development"; // investigate
const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY!;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST! || "https://app.posthog.com";
const STRIPE_PRODUCT_PRO = process.env.NEXT_PUBLIC_STRIPE_PRODUCT_PRO!;
const STRIPE_PRODUCT_STARTER = process.env.NEXT_PUBLIC_STRIPE_PRODUCT_STARTER!;
const SITE_URL = "https://app.infisical.com";

export {
  ENV,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  SITE_URL,
  STRIPE_PRODUCT_PRO,
  STRIPE_PRODUCT_STARTER
};