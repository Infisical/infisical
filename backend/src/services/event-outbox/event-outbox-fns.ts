import pLimit from "p-limit";
import { z } from "zod";

import { EventResultStatus, TEvent, TEventConsumerResult } from "./event-outbox-types";

// A payload that fails the consumer's schema is a bug at the emit site, so the event is failed with
// the issues named rather than retried.
export const parseEventPayload = <T extends z.ZodTypeAny>(
  event: TEvent,
  schema: T,
  label: string
): { data: z.infer<T>; failure?: undefined } | { data?: undefined; failure: TEventConsumerResult } => {
  const parsed = schema.safeParse(event.data);
  if (parsed.success) return { data: parsed.data as z.infer<T> };

  return {
    failure: {
      id: event.id,
      status: EventResultStatus.Failed,
      error: `Unreadable ${label} payload: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
    }
  };
};

// One event at a time, so two events for the same resource never race, and a throw costs only that
// event a retry instead of the whole batch.
export const runEventsSerially = async (
  events: TEvent[],
  handleEvent: (event: TEvent) => Promise<TEventConsumerResult>
): Promise<TEventConsumerResult[]> => {
  const results: TEventConsumerResult[] = [];

  for (const event of events) {
    try {
      // eslint-disable-next-line no-await-in-loop -- ordering is the point
      results.push(await handleEvent(event));
    } catch (error) {
      results.push({
        id: event.id,
        status: EventResultStatus.Retry,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return results;
};

export const runEventsConcurrentlyByKey = async (
  events: TEvent[],
  {
    keyOf,
    concurrency,
    handleEvent
  }: {
    keyOf: (event: TEvent) => string | undefined;
    concurrency: number;
    handleEvent: (event: TEvent) => Promise<TEventConsumerResult>;
  }
): Promise<TEventConsumerResult[]> => {
  const groups: TEvent[][] = [];
  const indexByKey = new Map<string, number>();

  events.forEach((event) => {
    const key = keyOf(event) ?? `event:${event.id}`;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push([event]);
    } else {
      groups[existing].push(event);
    }
  });

  const limit = pLimit(concurrency);
  const groupResults = await Promise.all(groups.map((group) => limit(() => runEventsSerially(group, handleEvent))));
  return groupResults.flat();
};
