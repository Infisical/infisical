import { PostHog } from "posthog-node";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { InstanceType } from "@app/ee/services/license/license-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { PostHogEventTypes, TPostHogEvent, TSecretModifiedEvent } from "./telemetry-types";

export const TELEMETRY_SECRET_PROCESSED_KEY = "telemetry-secret-processed";
export const TELEMETRY_SECRET_OPERATIONS_KEY = "telemetry-secret-operations";

export type TTelemetryServiceFactory = ReturnType<typeof telemetryServiceFactory>;
export type TTelemetryServiceFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "incrementBy">;
  licenseService: Pick<TLicenseServiceFactory, "getInstanceType">;
};

export const telemetryServiceFactory = ({ keyStore, licenseService }: TTelemetryServiceFactoryDep) => {
  const appCfg = getConfig();

  if (appCfg.isProductionMode && !appCfg.TELEMETRY_ENABLED) {
    // eslint-disable-next-line
    console.log(`
To improve, Infisical collects telemetry data about general usage.
This helps us understand how the product is doing and guide our product development to create the best possible platform; it also helps us demonstrate growth as we support Infisical as open-source software.
To opt into telemetry, you can set "TELEMETRY_ENABLED=true" within the environment variables.
`);
  }

  const postHog = appCfg.TELEMETRY_ENABLED
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
      const instanceType = licenseService.getInstanceType();
      // capture posthog only when its cloud or signup event happens in self-hosted
      if (instanceType === InstanceType.Cloud || event.event === PostHogEventTypes.UserSignedUp) {
        postHog.capture({
          event: event.event,
          distinctId: event.distinctId,
          properties: event.properties
        });
        return;
      }

      if (
        [
          PostHogEventTypes.SecretPulled,
          PostHogEventTypes.SecretCreated,
          PostHogEventTypes.SecretDeleted,
          PostHogEventTypes.SecretUpdated
        ].includes(event.event)
      ) {
        await keyStore.incrementBy(
          TELEMETRY_SECRET_PROCESSED_KEY,
          (event as TSecretModifiedEvent).properties.numberOfSecrets
        );
        await keyStore.incrementBy(TELEMETRY_SECRET_OPERATIONS_KEY, 1);
      }
    }
  };

  const flushAll = async () => {
    if (postHog) {
      await postHog.shutdownAsync();
    }
  };

  return {
    sendLoopsEvent,
    sendPostHogEvents,
    flushAll
  };
};
