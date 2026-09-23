import type { PostHog } from "posthog-js";
import posthog from "posthog-js";

import { envConfig } from "@app/config/env";

let postHogClient: PostHog | undefined;
let initializationAttempted = false;

export const isPostHogEnabled = () =>
  typeof window !== "undefined" &&
  envConfig.ENV === "production" &&
  envConfig.TELEMETRY_CAPTURING_ENABLED &&
  Boolean(envConfig.POSTHOG_API_KEY);

export const initPostHog = (): PostHog | undefined => {
  if (initializationAttempted) return postHogClient;

  initializationAttempted = true;

  try {
    if (!isPostHogEnabled()) return undefined;

    posthog.init(envConfig.POSTHOG_API_KEY!, {
      api_host: envConfig.POSTHOG_HOST,
      persistence: "localStorage+cookie"
    });
    postHogClient = posthog;
  } catch (error) {
    console.error("PostHog initialization failed", error);
  }

  return postHogClient;
};

export const getPostHog = () => postHogClient ?? initPostHog();
