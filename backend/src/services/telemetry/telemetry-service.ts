import { PostHog } from "posthog-node";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { TPostHogEvent } from "./telemetry-types";

export type TTelemetryServiceFactory = ReturnType<typeof telemetryServiceFactory>;

// type TTelemetryServiceFactoryDep = {};
export const telemetryServiceFactory = () => {
  const appCfg = getConfig();

  if (appCfg.isProductionMode && !appCfg.TELEMETRY_ENABLED) {
    // eslint-disable-next-line
    console.log(`
To improve, Infisical collects telemetry data about general usage.
This helps us understand how the product is doing and guide our product development to create the best possible platform; it also helps us demonstrate growth as we support Infisical as open-source software.
To opt into telemetry, you can set "TELEMETRY_ENABLED=true" within the environment variables.
`);
  }

  const postHog =
    appCfg.isProductionMode && appCfg.TELEMETRY_ENABLED
      ? new PostHog(appCfg.POSTHOG_PROJECT_API_KEY, { host: appCfg.POSTHOG_HOST })
      : undefined;

  // used for email marketting email sending purpose
  const sendLoopsEvent = async (email: string, firstName?: string, lastName?: string) => {
    if (appCfg.isProductionMode && appCfg.LOOPS_API_KEY) {
      try {
        await request.post(
          "https://app.loops.so/api/v1/events/send",
          {
            eventName: "Sign Up",
            email,
            firstName,
            lastName
          },
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${appCfg.LOOPS_API_KEY}`
            }
          }
        );
      } catch (error) {
        logger.error(error);
      }
    }
  };

  const sendPostHogEvents = async (event: TPostHogEvent) => {
    if (postHog) {
      postHog.capture({
        event: event.event,
        distinctId: event.distinctId,
        properties: event.properties
      });
    }
  };

  return {
    sendLoopsEvent,
    sendPostHogEvents
  };
};
