import { z } from "zod";

import { logger } from "@app/lib/logger";
import {
  EventResultStatus,
  IEventConsumer,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";

import { DELEGATED_APPROVAL_CALLBACK_EVENT_CONSUMER } from "./delegated-approval-callback-constants";
import { DelegatedApprovalCallbackEvent } from "./delegated-approval-callback-enums";

export const DelegatedApprovalCallbackEventPayloadSchema = z.object({
  delegatedRequestId: z.string().uuid(),
  approvalRequestId: z.string().uuid(),
  orgId: z.string().uuid(),
  event: z.nativeEnum(DelegatedApprovalCallbackEvent),
  externalId: z.string().trim().min(1).max(255)
});

type TDelegatedApprovalCallbackEventPayload = z.infer<typeof DelegatedApprovalCallbackEventPayloadSchema>;

const CALLBACK_EVENTS = new Set<string>(Object.values(DelegatedApprovalCallbackEvent));

export const delegatedApprovalCallbackEventConsumerFactory =
  (): IEventConsumer<TDelegatedApprovalCallbackEventPayload> => {
    const subscribesTo = (eventType: string) => CALLBACK_EVENTS.has(eventType);

    // Placeholder until the worker that reads the decision back from the delegated approval system
    // exists. It only has to accept the row so the callback is recorded.
    const $handleEvent = (event: TEvent): TEventConsumerResult => {
      const id = String(event.id);
      const payload = DelegatedApprovalCallbackEventPayloadSchema.safeParse(event.payload);
      if (!payload.success) {
        return { id, status: EventResultStatus.Failed, error: "Unreadable delegated approval callback payload" };
      }

      logger.info(
        `Delegated approval callback event received; processing is not implemented yet [eventId=${id}] [delegatedRequestId=${payload.data.delegatedRequestId}] [event=${payload.data.event}]`
      );
      return { id, status: EventResultStatus.Delivered };
    };

    const handle = async (events: TEvent[]): Promise<TEventConsumerResult[]> =>
      events.map((event) => {
        try {
          return $handleEvent(event);
        } catch (error) {
          return {
            id: String(event.id),
            status: EventResultStatus.Retry,
            error: error instanceof Error ? error.message : "Unknown error"
          };
        }
      });

    return {
      name: DELEGATED_APPROVAL_CALLBACK_EVENT_CONSUMER,
      payloadSchema: DelegatedApprovalCallbackEventPayloadSchema,
      subscribesTo,
      handle
    };
  };
