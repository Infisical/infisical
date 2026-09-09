import { z } from "zod";

import { AlertDispatchOutcome, recordAlertDispatchOutcomeMetric } from "@app/lib/telemetry/metrics";
import {
  EventOutboxStatus,
  IEventOutboxConsumer,
  TEventOutboxRow,
  TOutboxRowResult
} from "@app/services/event-outbox/event-outbox-types";

import { TAlertDALFactory } from "./alert-dal";
import { TAlertEngine } from "./alert-engine";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { AlertTriggerType, MAX_TARGET_IDS_PER_EVENT } from "./alert-types";

export const ALERT_OUTBOX_CONSUMER = "alert";

// The contract every event-triggered alert shares: the emitter names targets by id and the provider
// rehydrates them at delivery time. Keeping the payload to identifiers is what lets one consumer
// serve every provider without knowing their shapes.
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

type TAlertLookup = Pick<TAlertDALFactory, "findEnabledForEvent">["findEnabledForEvent"];

export const alertEventConsumerFactory = ({
  alertDAL,
  alertEngine,
  alertProviderRegistry
}: TAlertEventConsumerDep): IEventOutboxConsumer<z.infer<typeof AlertEventPayloadSchema>> => {
  const subscribesTo = (eventType: string): boolean => alertProviderRegistry.eventTriggeredKeys().has(eventType);

  // subscribesTo only sees the event type, so an emitter pairing a valid event key with the wrong
  // resourceType gets past the gate. Failing it here, terminally and naming both halves, is what
  // stops that row from being marked delivered as "no matching alert".
  const $isDeclaredEvent = (row: TEventOutboxRow): boolean =>
    Boolean(
      alertProviderRegistry
        .get(row.resourceType)
        ?.events.some((event) => event.key === row.eventType && event.triggerType === AlertTriggerType.Event)
    );

  const $handleRow = async (row: TEventOutboxRow, findAlerts: TAlertLookup): Promise<TOutboxRowResult> => {
    const id = String(row.id);

    if (!$isDeclaredEvent(row)) {
      return {
        id,
        status: EventOutboxStatus.Failed,
        error: `No alert provider for resource type '${row.resourceType}' declares '${row.eventType}' as an event-triggered alert`
      };
    }

    const payload = AlertEventPayloadSchema.safeParse(row.payload);
    if (!payload.success) {
      return {
        id,
        status: EventOutboxStatus.Failed,
        error: `Unreadable alert event payload: ${payload.error.issues.map((issue) => issue.message).join(", ")}`
      };
    }

    const progress = AlertEventProgressSchema.safeParse(row.progress ?? {});
    const delivered = new Set(progress.success ? progress.data.deliveredChannelIds : []);

    const alerts = await findAlerts({
      orgId: row.orgId,
      projectId: row.projectId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      eventType: row.eventType
    });

    if (alerts.length === 0) {
      recordAlertDispatchOutcomeMetric({
        resourceType: row.resourceType,
        outcome: AlertDispatchOutcome.NoMatchingAlert
      });
      return { id, status: EventOutboxStatus.Delivered };
    }

    const errors: string[] = [];

    for (const alert of alerts) {
      // eslint-disable-next-line no-await-in-loop -- at most a project- and an org-scoped alert
      const result = await alertEngine.runAlertForEvent(alert, {
        eventType: row.eventType,
        targetIds: payload.data.targetIds,
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
      return { ...outcome, status: EventOutboxStatus.Retry, error: errors.join("; ") };
    }
    return { ...outcome, status: EventOutboxStatus.Delivered };
  };

  const handle = async (rows: TEventOutboxRow[]): Promise<TOutboxRowResult[]> => {
    // A batch shares one resource, so rows differ at most by event type and scope. Resolving once
    // per combination keeps a burst of events from repeating the same lookup for every row.
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

    const results: TOutboxRowResult[] = [];

    for (const row of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop -- ordering is the point
        results.push(await $handleRow(row, findAlerts));
      } catch (error) {
        // Contained to this row: throwing out of handle() sends the whole batch back for retry, which
        // re-notifies on every row that already delivered ahead of this one.
        results.push({
          id: String(row.id),
          status: EventOutboxStatus.Retry,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return results;
  };

  return {
    name: ALERT_OUTBOX_CONSUMER,
    payloadSchema: AlertEventPayloadSchema,
    subscribesTo,
    handle
  };
};
