import { PostHog } from "posthog-node";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { InstanceType } from "@app/ee/services/license/license-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import { PostHogEventTypes, TPostHogEvent, TSecretModifiedEvent } from "./telemetry-types";

export const TELEMETRY_SECRET_PROCESSED_KEY = "telemetry-secret-processed";
export const TELEMETRY_SECRET_OPERATIONS_KEY = "telemetry-secret-operations";

export const POSTHOG_AGGREGATED_EVENTS = [PostHogEventTypes.SecretPulled];
const TELEMETRY_AGGREGATED_KEY_EXP = 600; // 10mins

// Bucket configuration
const TELEMETRY_BUCKET_COUNT = 30;
const TELEMETRY_BUCKET_NAMES = Array.from(
  { length: TELEMETRY_BUCKET_COUNT },
  (_, i) => `bucket-${i.toString().padStart(2, "0")}`
);

type AggregatedEventData = Record<string, unknown>;
type SingleEventData = {
  distinctId: string;
  event: string;
  properties: unknown;
  organizationId: string;
};

export type TTelemetryServiceFactory = ReturnType<typeof telemetryServiceFactory>;
export type TTelemetryServiceFactoryDep = {
  keyStore: Pick<
    TKeyStoreFactory,
    "incrementBy" | "deleteItemsByKeyIn" | "setItemWithExpiry" | "getKeysByPattern" | "getItems"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getInstanceType">;
};

const getBucketForDistinctId = (distinctId: string): string => {
  // Use SHA-256 hash for consistent distribution
  const hash = crypto.nativeCrypto.createHash("sha256").update(distinctId).digest("hex");

  // Take first 8 characters and convert to number for better distribution
  const hashNumber = parseInt(hash.substring(0, 8), 16);
  const bucketIndex = hashNumber % TELEMETRY_BUCKET_COUNT;

  return TELEMETRY_BUCKET_NAMES[bucketIndex];
};

export const createTelemetryEventKey = (event: string, distinctId: string): string => {
  const bucketId = getBucketForDistinctId(distinctId);
  return `telemetry-event-${event}-${bucketId}-${distinctId}-${crypto.nativeCrypto.randomUUID()}`;
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
        if (POSTHOG_AGGREGATED_EVENTS.includes(event.event)) {
          const eventKey = createTelemetryEventKey(event.event, event.distinctId);
          await keyStore.setItemWithExpiry(
            eventKey,
            TELEMETRY_AGGREGATED_KEY_EXP,
            JSON.stringify({
              distinctId: event.distinctId,
              event: event.event,
              properties: event.properties,
              organizationId: event.organizationId
            })
          );
        } else {
          if (event.organizationId) {
            try {
              postHog.groupIdentify({ groupType: "organization", groupKey: event.organizationId });
            } catch (error) {
              logger.error(error, "Failed to identify PostHog organization");
            }
          }
          postHog.capture({
            event: event.event,
            distinctId: event.distinctId,
            properties: event.properties,
            ...(event.organizationId ? { groups: { organization: event.organizationId } } : {})
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

  const aggregateGroupProperties = (events: SingleEventData[]): AggregatedEventData => {
    const aggregatedData: AggregatedEventData = {};

    // Set the total count
    aggregatedData.count = events.length;

    events.forEach((event) => {
      if (!event.properties) return;

      Object.entries(event.properties as Record<string, unknown>).forEach(([key, value]: [string, unknown]) => {
        if (Array.isArray(value)) {
          // For arrays, count occurrences of each item
          const existingCounts =
            aggregatedData[key] &&
            typeof aggregatedData[key] === "object" &&
            aggregatedData[key]?.constructor === Object
              ? (aggregatedData[key] as Record<string, number>)
              : {};

          value.forEach((item) => {
            const itemKey = typeof item === "object" ? JSON.stringify(item) : String(item);
            existingCounts[itemKey] = (existingCounts[itemKey] || 0) + 1;
          });

          aggregatedData[key] = existingCounts;
        } else if (typeof value === "object" && value?.constructor === Object) {
          // For objects, count occurrences of each field value
          const existingCounts =
            aggregatedData[key] &&
            typeof aggregatedData[key] === "object" &&
            aggregatedData[key]?.constructor === Object
              ? (aggregatedData[key] as Record<string, number>)
              : {};

          if (value) {
            Object.values(value).forEach((fieldValue) => {
              const valueKey = typeof fieldValue === "object" ? JSON.stringify(fieldValue) : String(fieldValue);
              existingCounts[valueKey] = (existingCounts[valueKey] || 0) + 1;
            });
          }
          aggregatedData[key] = existingCounts;
        } else if (typeof value === "number") {
          // For numbers, add to existing sum
          aggregatedData[key] = ((aggregatedData[key] as number) || 0) + value;
        } else if (value !== undefined && value !== null) {
          // For other types (strings, booleans, etc.), count occurrences
          const stringValue = String(value);
          const existingValue = aggregatedData[key];

          if (!existingValue) {
            aggregatedData[key] = { [stringValue]: 1 };
          } else if (existingValue && typeof existingValue === "object" && existingValue.constructor === Object) {
            const countObject = existingValue as Record<string, number>;
            countObject[stringValue] = (countObject[stringValue] || 0) + 1;
          } else {
            const oldValue = String(existingValue);
            aggregatedData[key] = {
              [oldValue]: 1,
              [stringValue]: 1
            };
          }
        }
      });
    });

    return aggregatedData;
  };

  const processBucketEvents = async (eventType: string, bucketId: string) => {
    if (!postHog) return 0;

    try {
      const bucketPattern = `telemetry-event-${eventType}-${bucketId}-*`;
      const bucketKeys = await keyStore.getKeysByPattern(bucketPattern);

      if (bucketKeys.length === 0) return 0;

      const bucketEvents = await keyStore.getItems(bucketKeys);
      let bucketEventsParsed: SingleEventData[] = [];

      try {
        bucketEventsParsed = bucketEvents
          .filter((event) => event !== null)
          .map((event) => JSON.parse(event as string) as SingleEventData);
      } catch (error) {
        logger.error(error, `Failed to parse bucket events for ${eventType} in ${bucketId}`);
        return 0;
      }

      const eventsGrouped = new Map<string, SingleEventData[]>();

      bucketEventsParsed.forEach((event) => {
        const key = JSON.stringify({ id: event.distinctId, org: event.organizationId });
        if (!eventsGrouped.has(key)) {
          eventsGrouped.set(key, []);
        }
        eventsGrouped.get(key)!.push(event);
      });

      if (eventsGrouped.size === 0) return 0;

      for (const [eventsKey, events] of eventsGrouped) {
        const key = JSON.parse(eventsKey) as { id: string; org?: string };
        if (key.org) {
          try {
            postHog.groupIdentify({ groupType: "organization", groupKey: key.org });
          } catch (error) {
            logger.error(error, "Failed to identify PostHog organization");
          }
        }
        const properties = aggregateGroupProperties(events);

        postHog.capture({
          event: `${eventType} aggregated`,
          distinctId: key.id,
          properties,
          ...(key.org ? { groups: { organization: key.org } } : {})
        });
      }

      // Clean up processed data for this bucket
      await keyStore.deleteItemsByKeyIn(bucketKeys);

      logger.info(`Processed ${bucketEventsParsed.length} events from bucket ${bucketId} for ${eventType}`);
      return bucketEventsParsed.length;
    } catch (error) {
      logger.error(error, `Failed to process bucket ${bucketId} for ${eventType}`);
      return 0;
    }
  };

  const processAggregatedEvents = async () => {
    if (!postHog) return;

    for (const eventType of POSTHOG_AGGREGATED_EVENTS) {
      let totalProcessed = 0;

      logger.debug(`Starting bucket processing for ${eventType}`);

      // Process each bucket sequentially to control memory usage
      for (const bucketId of TELEMETRY_BUCKET_NAMES) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const processed = await processBucketEvents(eventType, bucketId);
          totalProcessed += processed;
        } catch (error) {
          logger.error(error, `Failed to process bucket ${bucketId} for ${eventType}`);
        }
      }

      if (totalProcessed > 0) {
        logger.info(`Completed processing ${totalProcessed} total events for ${eventType}`);
      } else {
        logger.debug(`Completed processing 0 events for ${eventType}`);
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
    flushAll,
    getBucketForDistinctId
  };
};
