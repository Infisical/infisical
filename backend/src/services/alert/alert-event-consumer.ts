import { z } from "zod";

import { AlertDispatchOutcome, recordAlertDispatchOutcomeMetric } from "@app/lib/telemetry/metrics";
import {
  EventResultStatus,
  IEventConsumer,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";

import { TAlertDALFactory } from "./alert-dal";
import { TAlertEngine } from "./alert-engine";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { AlertTriggerType, MAX_TARGET_IDS_PER_EVENT } from "./alert-types";

export const ALERT_EVENT_CONSUMER = "alert";

export const AlertEventPayloadSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().trim().min(1).max(255).nullish(),
  resourceType: z.string().trim().min(1).max(255),
  resourceId: z.string().trim().min(1).max(255),
  targetIds: z.array(z.string().trim().min(1).max(255)).min(1).max(MAX_TARGET_IDS_PER_EVENT)
});

type TAlertEventPayload = z.infer<typeof AlertEventPayloadSchema>;

export type TAlertEventConsumerDep = {
  alertDAL: Pick<TAlertDALFactory, "findEnabledForEvent">;
  alertEngine: Pick<TAlertEngine, "runAlertForEvent">;
  alertProviderRegistry: Pick<TAlertProviderRegistry, "get" | "eventTriggeredKeys">;
};

type TAlertLookup = TAlertDALFactory["findEnabledForEvent"];

export const alertEventConsumerFactory = ({
  alertDAL,
  alertEngine,
  alertProviderRegistry
}: TAlertEventConsumerDep): IEventConsumer<TAlertEventPayload> => {
  const subscribesTo = (eventType: string): boolean => alertProviderRegistry.eventTriggeredKeys().has(eventType);

  // subscribesTo only sees the event type, so a valid event key on the wrong resourceType gets past it.
  // Fail here, terminally and naming both, instead of marking the event delivered as "no matching alert".
  const $isDeclaredEvent = (eventType: string, resourceType: string): boolean =>
    Boolean(
      alertProviderRegistry
        .get(resourceType)
        ?.events.some((declared) => declared.key === eventType && declared.triggerType === AlertTriggerType.Event)
    );

  const $handleEvent = async (event: TEvent, findAlerts: TAlertLookup): Promise<TEventConsumerResult> => {
    const id = String(event.id);

    const payload = AlertEventPayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `Unreadable alert event payload: ${payload.error.issues.map((issue) => issue.message).join(", ")}`
      };
    }
    const { orgId, projectId, resourceType, resourceId, targetIds } = payload.data;

    if (!$isDeclaredEvent(event.eventType, resourceType)) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `No alert provider for resource type '${resourceType}' declares '${event.eventType}' as an event-triggered alert`
      };
    }

    const alerts = await findAlerts({
      orgId,
      projectId,
      resourceType,
      resourceId,
      eventType: event.eventType
    });

    if (alerts.length === 0) {
      recordAlertDispatchOutcomeMetric({ resourceType, outcome: AlertDispatchOutcome.NoMatchingAlert });
      return { id, status: EventResultStatus.Delivered };
    }

    const errors: string[] = [];

    for (const alert of alerts) {
      // eslint-disable-next-line no-await-in-loop -- at most a project- and an org-scoped alert
      const outcome = await alertEngine.runAlertForEvent(alert, {
        eventId: id,
        eventType: event.eventType,
        targetIds,
        payload: (event.payload ?? {}) as Record<string, unknown>
      });
      recordAlertDispatchOutcomeMetric({ resourceType: alert.resourceType, outcome });

      if (outcome === AlertDispatchOutcome.DeliveryFailed || outcome === AlertDispatchOutcome.DeliveryPartial) {
        errors.push(`alert ${alert.id}: ${outcome}`);
      }
    }

    if (errors.length > 0) {
      return { id, status: EventResultStatus.Retry, error: errors.join("; ") };
    }
    return { id, status: EventResultStatus.Delivered };
  };

  const handle = async (events: TEvent[]): Promise<TEventConsumerResult[]> => {
    const alertsByScope = new Map<string, ReturnType<TAlertLookup>>();
    const findAlerts: TAlertLookup = (filter) => {
      const key = `${filter.orgId}|${filter.projectId ?? ""}|${filter.eventType}`;
      let lookup = alertsByScope.get(key);
      if (!lookup) {
        lookup = alertDAL.findEnabledForEvent(filter);
        alertsByScope.set(key, lookup);
      }
      return lookup;
    };

    const results: TEventConsumerResult[] = [];

    for (const event of events) {
      try {
        // eslint-disable-next-line no-await-in-loop -- ordering is the point
        results.push(await $handleEvent(event, findAlerts));
      } catch (error) {
        results.push({
          id: String(event.id),
          status: EventResultStatus.Retry,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return results;
  };

  return {
    name: ALERT_EVENT_CONSUMER,
    payloadSchema: AlertEventPayloadSchema,
    subscribesTo,
    handle
  };
};
