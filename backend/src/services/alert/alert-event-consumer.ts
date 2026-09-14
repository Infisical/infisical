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

// Emitters name targets by id and the provider rehydrates them at delivery. Keeping the payload to
// ids is what lets one consumer serve every provider.
export const AlertEventPayloadSchema = z.object({
  targetIds: z.array(z.string().trim().min(1).max(255)).min(1).max(MAX_TARGET_IDS_PER_EVENT)
});

const AlertEventProgressSchema = z.object({
  deliveredChannelIds: z.array(z.string()).default([])
});

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
}: TAlertEventConsumerDep): IEventConsumer<z.infer<typeof AlertEventPayloadSchema>> => {
  const subscribesTo = (eventType: string): boolean => alertProviderRegistry.eventTriggeredKeys().has(eventType);

  // subscribesTo only sees the event type, so a valid event key on the wrong resourceType gets past it.
  // Fail here, terminally and naming both, instead of marking the event delivered as "no matching alert".
  const $isDeclaredEvent = (event: TEvent): boolean =>
    Boolean(
      alertProviderRegistry
        .get(event.resourceType)
        ?.events.some((declared) => declared.key === event.eventType && declared.triggerType === AlertTriggerType.Event)
    );

  const $handleEvent = async (event: TEvent, findAlerts: TAlertLookup): Promise<TEventConsumerResult> => {
    const id = String(event.id);

    if (!$isDeclaredEvent(event)) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `No alert provider for resource type '${event.resourceType}' declares '${event.eventType}' as an event-triggered alert`
      };
    }

    const payload = AlertEventPayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `Unreadable alert event payload: ${payload.error.issues.map((issue) => issue.message).join(", ")}`
      };
    }

    const progress = AlertEventProgressSchema.safeParse(event.progress ?? {});
    const delivered = new Set(progress.success ? progress.data.deliveredChannelIds : []);

    const alerts = await findAlerts({
      orgId: event.orgId,
      projectId: event.projectId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      eventType: event.eventType
    });

    if (alerts.length === 0) {
      recordAlertDispatchOutcomeMetric({
        resourceType: event.resourceType,
        outcome: AlertDispatchOutcome.NoMatchingAlert
      });
      return { id, status: EventResultStatus.Delivered };
    }

    const errors: string[] = [];

    for (const alert of alerts) {
      // eslint-disable-next-line no-await-in-loop -- at most a project- and an org-scoped alert
      const result = await alertEngine.runAlertForEvent(alert, {
        eventType: event.eventType,
        targetIds: payload.data.targetIds,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        skipChannelIds: [...delivered]
      });
      result.deliveredChannelIds.forEach((channelId) => delivered.add(channelId));
      recordAlertDispatchOutcomeMetric({ resourceType: alert.resourceType, outcome: result.outcome });

      if (
        result.outcome === AlertDispatchOutcome.DeliveryFailed ||
        result.outcome === AlertDispatchOutcome.DeliveryPartial
      ) {
        errors.push(`alert ${alert.id}: ${result.outcome}`);
      }
    }

    const outcome = { id, progress: { deliveredChannelIds: [...delivered] } };
    if (errors.length > 0) {
      return { ...outcome, status: EventResultStatus.Retry, error: errors.join("; ") };
    }
    return { ...outcome, status: EventResultStatus.Delivered };
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
