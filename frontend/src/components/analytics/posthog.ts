import posthog from "posthog-js";

import { envConfig } from "@app/config/env";

export const initPostHog = () => {
  console.log("Hi there 👋");
  try {
    if (typeof window !== "undefined") {
      if (
        envConfig.ENV === "production" &&
        envConfig.TELEMETRY_CAPTURING_ENABLED === true &&
        envConfig.POSTHOG_API_KEY
      ) {
        posthog.init(envConfig.POSTHOG_API_KEY, {
          api_host: envConfig.POSTHOG_HOST
        });
      }
    }

    return posthog;
  } catch (e) {
    console.log("posthog err", e);
  }

  return undefined;
};
