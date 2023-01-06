/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-undef */
import posthog from 'posthog-js';

import { ENV, POSTHOG_API_KEY, POSTHOG_HOST } from '../utilities/config';

export const initPostHog = () => {
  try {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      if (ENV == 'production' && TELEMETRY_CAPTURING_ENABLED) {
        console.log("Outside of posthog", "POSTHOG_API_KEY", POSTHOG_API_KEY, "POSTHOG_HOST", POSTHOG_HOST)
        posthog.init(POSTHOG_API_KEY, {
          api_host: POSTHOG_HOST
        });
      }

      console.log("Outside of posthog")
    }

    return posthog;
  } catch (e) {
    console.log("posthog err", e)
  }
};
