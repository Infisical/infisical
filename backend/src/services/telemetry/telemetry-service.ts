import { requestContext } from "@fastify/request-context";
import { PostHog } from "posthog-node";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { InstanceType } from "@app/ee/services/license/license-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { requestContextKeys } from "@app/lib/request-context/request-context-keys";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { HubSpotSignupMethod, PostHogEventTypes, TPostHogEvent, TSecretModifiedEvent } from "./telemetry-types";

export const TELEMETRY_SECRET_PROCESSED_KEY = "telemetry-secret-processed";
export const TELEMETRY_SECRET_OPERATIONS_KEY = "telemetry-secret-operations";

export const POSTHOG_AGGREGATED_EVENTS = [PostHogEventTypes.SecretPulled, PostHogEventTypes.MachineIdentityLogin];
const TELEMETRY_AGGREGATED_KEY_EXP = 600; // 10mins
const GROUP_IDENTIFY_CACHE_TTL = 3600; // 1 hour

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
  organizationName?: string;
};

export type TTelemetryServiceFactory = ReturnType<typeof telemetryServiceFactory>;
export type TTelemetryServiceFactoryDep = {
  keyStore: Pick<
    TKeyStoreFactory,
    "incrementBy" | "deleteItemsByKeyIn" | "setItemWithExpiry" | "setItemWithExpiryNX" | "getKeysByPattern" | "getItems"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getInstanceType" | "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
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

export const telemetryServiceFactory = ({ keyStore, licenseService, orgDAL }: TTelemetryServiceFactoryDep) => {
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

  const sendHubSpotSignupEvent = async (
    email: string,
    signupMethod: HubSpotSignupMethod,
    firstName?: string,
    lastName?: string
  ) => {
    const instanceType = licenseService.getInstanceType();
    if (
      appCfg.isProductionMode &&
      instanceType === InstanceType.Cloud &&
      appCfg.HUBSPOT_PORTAL_ID &&
      appCfg.HUBSPOT_SIGNUP_FORM_ID
    ) {
      try {
        const fields: { name: string; value: string }[] = [
          { name: "email", value: email },
          { name: "signup_method", value: signupMethod }
        ];

        const optionalFields: Record<string, string | undefined> = {
          firstname: firstName,
          lastname: lastName
        };

        for (const [name, value] of Object.entries(optionalFields)) {
          if (value) fields.push({ name, value });
        }

        await request.post(
          `https://api.hsforms.com/submissions/v3/integration/submit/${appCfg.HUBSPOT_PORTAL_ID}/${appCfg.HUBSPOT_SIGNUP_FORM_ID}`,
          {
            fields,
            context: {
              pageUri: `${appCfg.SITE_URL || "https://app.infisical.com"}/signup`,
              pageName: "App Signup"
            }
          },
          {
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      } catch (error) {
        logger.error(error, "Failed to send HubSpot signup event");
      }
    }
  };

  const getOrgGroupProperties = async (orgId: string, orgName?: string): Promise<Record<string, unknown>> => {
    const properties: Record<string, unknown> = {};
    if (orgName) {
      properties.name = orgName;
    }

    const instanceType = licenseService.getInstanceType();
    properties.is_cloud = instanceType === InstanceType.Cloud;

    try {
      const org = await orgDAL.findOrgById(orgId);
      if (org) {
        if (!properties.name) {
          properties.name = org.name;
        }
        properties.created_at = org.createdAt.toISOString();
      }
    } catch (error) {
      logger.error(error, "Failed to fetch org details for PostHog group properties");
    }

    try {
      const plan = await licenseService.getPlan(orgId);
      properties.plan = plan.slug ?? "free";
      properties.seat_count = plan.membersUsed;
    } catch (error) {
      logger.error(error, "Failed to fetch org plan for PostHog group properties");
    }

    return properties;
  };

  const sendPostHogEvents = async (event: TPostHogEvent) => {
    if (!appCfg.INFISICAL_CLOUD && postHog) {
      if (
        [
          PostHogEventTypes.SecretPulled,
          PostHogEventTypes.SecretCreated,
          PostHogEventTypes.SecretDeleted,
          PostHogEventTypes.SecretUpdated
        ].includes(event.event)
      ) {
        try {
          await keyStore.incrementBy(
            TELEMETRY_SECRET_PROCESSED_KEY,
            (event as TSecretModifiedEvent).properties.numberOfSecrets
          );
          await keyStore.incrementBy(TELEMETRY_SECRET_OPERATIONS_KEY, 1);
        } catch (error) {
          logger.error(error, "Failed to increment telemetry secret counters in Redis");
        }
      }
    }

    if (!postHog) return;

    // Resolve org name: prefer explicit value, fall back to request context
    const resolvedOrgName = event.organizationName ?? requestContext.get(requestContextKeys.orgName);

    if (POSTHOG_AGGREGATED_EVENTS.includes(event.event)) {
      const eventKey = createTelemetryEventKey(event.event, event.distinctId);
      await keyStore.setItemWithExpiry(
        eventKey,
        TELEMETRY_AGGREGATED_KEY_EXP,
        JSON.stringify({
          distinctId: event.distinctId,
          event: event.event,
          properties: event.properties,
          organizationId: event.organizationId,
          ...(resolvedOrgName ? { organizationName: resolvedOrgName } : {})
        })
      );
    } else {
      if (event.organizationId) {
        const orgId = event.organizationId;
        // Dedup groupIdentify: only fire once per org per hour to avoid redundant DB/API calls
        const groupIdentifyCacheKey = KeyStorePrefixes.TelemetryGroupIdentify(orgId);
        void keyStore
          .setItemWithExpiryNX(groupIdentifyCacheKey, GROUP_IDENTIFY_CACHE_TTL, "1")
          .then((wasSet) => {
            if (wasSet) {
              return getOrgGroupProperties(orgId, resolvedOrgName).then((groupProperties) => {
                postHog.groupIdentify({
                  groupType: "organization",
                  groupKey: orgId,
                  properties: groupProperties,
                  distinctId: event.distinctId
                });
              });
            }
            return undefined;
          })
          .catch((error) => {
            logger.error(error, "Failed to identify PostHog organization");
          });
      }
      postHog.capture({
        event: event.event,
        distinctId: event.distinctId,
        properties: event.properties,
        ...(event.organizationId ? { groups: { organization: event.organizationId } } : {})
      });
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

      // Cache org group properties per orgId to avoid redundant DB/API calls
      // when multiple users share the same org within a bucket
      const orgPropertiesCache = new Map<string, Record<string, unknown>>();

      for (const [eventsKey, events] of eventsGrouped) {
        const key = JSON.parse(eventsKey) as { id: string; org?: string };
        if (key.org) {
          try {
            // Dedup groupIdentify across all paths: only fire once per org per hour
            const groupIdentifyCacheKey = KeyStorePrefixes.TelemetryGroupIdentify(key.org);
            // eslint-disable-next-line no-await-in-loop
            const wasSet = await keyStore.setItemWithExpiryNX(groupIdentifyCacheKey, GROUP_IDENTIFY_CACHE_TTL, "1");
            if (wasSet) {
              let groupProperties = orgPropertiesCache.get(key.org);
              if (!groupProperties) {
                const orgName = events[0]?.organizationName;
                // eslint-disable-next-line no-await-in-loop
                groupProperties = await getOrgGroupProperties(key.org, orgName);
                orgPropertiesCache.set(key.org, groupProperties);
              }
              postHog.groupIdentify({
                groupType: "organization",
                groupKey: key.org,
                properties: groupProperties,
                distinctId: key.id
              });
            }
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

      logger.info(`Starting bucket processing for ${eventType}`);

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

      logger.info(`Completed processing ${totalProcessed} total events for ${eventType}`);
    }
  };

  const TELEMETRY_IDENTIFY_CACHE_KEY_PREFIX = "telemetry-identify";
  const TELEMETRY_IDENTIFY_CACHE_TTL = 86400; // 24 hours
  // Shorter TTL for in-memory fallback to bound memory growth during Redis outages
  const IN_MEMORY_IDENTIFY_FALLBACK_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // In-memory fallback dedup set to limit blast radius during Redis outages
  const inMemoryIdentifyDedup = new Set<string>();

  const identifyUser = async (
    distinctId: string,
    properties: {
      email?: string;
      username?: string;
      userId?: string;
      firstName?: string;
      lastName?: string;
      isMfaEnabled?: boolean;
      isEmailVerified?: boolean;
      superAdmin?: boolean;
    },
    { skipDedup }: { skipDedup?: boolean } = {}
  ) => {
    if (postHog && distinctId) {
      if (!skipDedup) {
        try {
          const cacheKey = `${TELEMETRY_IDENTIFY_CACHE_KEY_PREFIX}:${distinctId}`;
          // Atomic SET NX + EX: only the first caller within the TTL window proceeds
          const wasSet = await keyStore.setItemWithExpiryNX(cacheKey, TELEMETRY_IDENTIFY_CACHE_TTL, "1");
          if (!wasSet) return;
        } catch (error) {
          logger.error(error, `Failed to check PostHog identify dedup cache for distinctId=${distinctId}`);
          // In-memory fallback to limit blast radius during Redis outage
          if (inMemoryIdentifyDedup.has(distinctId)) return;
          inMemoryIdentifyDedup.add(distinctId);
          const timer = setTimeout(() => inMemoryIdentifyDedup.delete(distinctId), IN_MEMORY_IDENTIFY_FALLBACK_TTL_MS);
          timer.unref();
        }
      }
      try {
        postHog.identify({ distinctId, properties });
      } catch (err) {
        logger.error(err, `Failed to call postHog.identify for distinctId=${distinctId}`);
      }
    }
  };

  // In-memory fallback dedup set to limit blast radius during Redis outages
  const inMemoryIdentityDedup = new Set<string>();

  const identifyIdentity = async (
    identityId: string,
    properties: {
      name?: string;
      authMethod?: string;
    }
  ) => {
    if (postHog && identityId) {
      const dedupKey = `${identityId}-${properties.authMethod ?? ""}`;
      try {
        const cacheKey = KeyStorePrefixes.TelemetryIdentifyIdentity(dedupKey);
        // Atomic SET NX + EX: only the first caller within the TTL window proceeds
        const wasSet = await keyStore.setItemWithExpiryNX(
          cacheKey,
          KeyStoreTtls.TelemetryIdentifyIdentityInSeconds,
          "1"
        );
        if (!wasSet) return;
      } catch (error) {
        logger.error(error, `Failed to check PostHog identity dedup cache [identityId=${identityId}]`);
        // In-memory fallback to limit blast radius during Redis outage
        if (inMemoryIdentityDedup.has(dedupKey)) return;
        inMemoryIdentityDedup.add(dedupKey);
        const timer = setTimeout(() => inMemoryIdentityDedup.delete(dedupKey), IN_MEMORY_IDENTIFY_FALLBACK_TTL_MS);
        timer.unref();
        // falls through intentionally: first caller during Redis outage still identifies
      }

      const distinctId = `identity-${identityId}`;
      const enrichedProperties = {
        ...properties,
        actorType: ActorType.IDENTITY,
        ...(properties.name ? { name: `[Machine Identity] ${properties.name}` } : {})
      };
      try {
        postHog.identify({ distinctId, properties: enrichedProperties });
      } catch (err) {
        logger.error(err, `Failed to call postHog.identify for machine identity [identityId=${identityId}]`);
      }
    }
  };

  const flushAll = async () => {
    if (postHog) {
      await postHog.shutdown();
    }
  };

  return {
    sendLoopsEvent,
    sendHubSpotSignupEvent,
    sendPostHogEvents,
    identifyUser,
    identifyIdentity,
    processAggregatedEvents,
    flushAll,
    getBucketForDistinctId
  };
};
