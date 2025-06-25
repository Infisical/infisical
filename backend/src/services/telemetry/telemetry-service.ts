import { PostHog } from "posthog-node";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { InstanceType } from "@app/ee/services/license/license-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { TPosthogAggregatedEventsDALFactory } from "./posthog-aggregated-events-dal";
import { PostHogEventTypes, TPostHogEvent, TSecretModifiedEvent } from "./telemetry-types";

export const TELEMETRY_SECRET_PROCESSED_KEY = "telemetry-secret-processed";
export const TELEMETRY_SECRET_OPERATIONS_KEY = "telemetry-secret-operations";

export const HOURLY_AGGREGATED_EVENTS = [PostHogEventTypes.SecretPulled];

interface AggregatedEventData {
  [key: string]: string | number | boolean | undefined | Record<string, number>;
}

export type TTelemetryServiceFactory = ReturnType<typeof telemetryServiceFactory>;
export type TTelemetryServiceFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "incrementBy" | "setItem" | "deleteItem" | "setItemWithExpiry">;
  licenseService: Pick<TLicenseServiceFactory, "getInstanceType">;
  posthogAggregatedEventsDAL: TPosthogAggregatedEventsDALFactory;
};

const getCurrentHourKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}`;
};

const getPreviousHourKey = () => {
  const now = new Date();
  now.setHours(now.getHours());
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}`;
};

export const telemetryServiceFactory = ({
  keyStore,
  licenseService,
  posthogAggregatedEventsDAL
}: TTelemetryServiceFactoryDep) => {
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

  const aggregateEventData = async (event: TPostHogEvent, organizationId?: string) => {
    const currentHour = getCurrentHourKey();

    try {
      const lastHourAggregatedEvent = await posthogAggregatedEventsDAL.getAggregatedEvent(
        currentHour,
        event.distinctId,
        event.event
      );
      const existingData = lastHourAggregatedEvent?.properties;
      let hourlyData: AggregatedEventData = {};

      if (existingData) {
        hourlyData = existingData as AggregatedEventData;
      }

      hourlyData.count = Number(lastHourAggregatedEvent?.eventCount || 0) + 1;

      if (event.properties) {
        Object.entries(event.properties).forEach(([key, value]: [string, unknown]) => {
          if (Array.isArray(value)) {
            // For arrays, count occurrences of each item
            const existingCounts =
              hourlyData[key] && typeof hourlyData[key] === "object" && hourlyData[key]?.constructor === Object
                ? (hourlyData[key] as Record<string, number>)
                : {};

            value.forEach((item) => {
              const itemKey = typeof item === "object" ? JSON.stringify(item) : String(item);
              existingCounts[itemKey] = (existingCounts[itemKey] || 0) + 1;
            });

            hourlyData[key] = existingCounts;
          } else if (typeof value === "object" && value?.constructor === Object) {
            // For objects, count occurrences of each field value
            const existingCounts =
              hourlyData[key] && typeof hourlyData[key] === "object" && hourlyData[key]?.constructor === Object
                ? (hourlyData[key] as Record<string, number>)
                : {};

            if (value) {
              Object.values(value).forEach((fieldValue) => {
                const valueKey = typeof fieldValue === "object" ? JSON.stringify(fieldValue) : String(fieldValue);
                existingCounts[valueKey] = (existingCounts[valueKey] || 0) + 1;
              });
            }
            hourlyData[key] = existingCounts;
          } else if (typeof value === "number") {
            // For numbers, add to existing sum
            hourlyData[key] = ((hourlyData[key] as number) || 0) + value;
          } else if (value !== undefined && value !== null) {
            // For other types (strings, booleans, etc.), count occurrences
            const stringValue = String(value);
            const existingValue = hourlyData[key];

            if (!existingValue) {
              hourlyData[key] = { [stringValue]: 1 };
            } else if (existingValue && typeof existingValue === "object" && existingValue.constructor === Object) {
              const countObject = existingValue;
              countObject[stringValue] = (countObject[stringValue] || 0) + 1;
            } else {
              const oldValue = String(existingValue);
              hourlyData[key] = {
                [oldValue]: 1,
                [stringValue]: 1
              };
            }
          }
        });
      }

      if (lastHourAggregatedEvent) {
        await posthogAggregatedEventsDAL.updateById(lastHourAggregatedEvent.id, {
          properties: hourlyData,
          eventCount: Number(lastHourAggregatedEvent.eventCount) + 1,
          organizationId: lastHourAggregatedEvent?.organizationId || organizationId
        });
        return;
      }

      await posthogAggregatedEventsDAL.create({
        batchId: currentHour,
        distinctId: event.distinctId,
        event: event.event,
        properties: hourlyData,
        eventCount: 1,
        organizationId
      });
    } catch (error) {
      logger.error(error, `Failed to aggregate event data for ${event.event}`);
    }
  };

  const sendPostHogEvents = async (event: TPostHogEvent) => {
    if (postHog) {
      const instanceType = licenseService.getInstanceType();
      // capture posthog only when its cloud or signup event happens in self-hosted
      if (instanceType === InstanceType.Cloud || event.event === PostHogEventTypes.UserSignedUp) {
        if (event.organizationId) {
          postHog.groupIdentify({ groupType: "organization", groupKey: event.organizationId });
        }
        if (HOURLY_AGGREGATED_EVENTS.includes(event.event)) {
          await aggregateEventData(event, event.organizationId);
        } else {
          postHog.capture({
            event: event.event,
            distinctId: event.distinctId,
            properties: event.properties,
            groups: event.organizationId ? { organization: event.organizationId } : undefined
          });
        }
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

  const processAggregatedEvents = async () => {
    if (!postHog) return;
    const previousHourKey = getPreviousHourKey();

    for (const eventType of HOURLY_AGGREGATED_EVENTS) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const events = await posthogAggregatedEventsDAL.getAllAggregatedEvent(previousHourKey, eventType);
        // eslint-disable-next-line no-continue
        if (events.length === 0) continue;

        const processedEvents: string[] = [];

        for (const event of events) {
          if (event.organizationId) {
            postHog.groupIdentify({ groupType: "organization", groupKey: event.organizationId });
          }
          postHog.capture({
            event: `${eventType} aggregated`,
            distinctId: event.distinctId,
            properties: event.properties as Record<string, unknown> | undefined,
            groups: event.organizationId ? { organization: event.organizationId } : undefined
          });
          processedEvents.push(event.id);
        }

        // Clean up processed data
        // eslint-disable-next-line no-await-in-loop
        await posthogAggregatedEventsDAL.delete({ $in: { id: processedEvents } });

        logger.info(`Processed aggregated events for ${eventType} at hour ${previousHourKey}`);
      } catch (error) {
        logger.error(error, `Failed to process aggregated events for ${eventType} at hour ${previousHourKey}`);
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
    processAggregatedEvents,
    flushAll
  };
};
