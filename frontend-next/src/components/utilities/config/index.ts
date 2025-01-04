const ENV = process.env.NEXT_PUBLIC_ENV! || "development"; // investigate
const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY!;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST! || "https://app.posthog.com";
const INTERCOMid = process.env.NEXT_PUBLIC_INTERCOMid!;
const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY!;

export { CAPTCHA_SITE_KEY, ENV, INTERCOMid, POSTHOG_API_KEY, POSTHOG_HOST };
