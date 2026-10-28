import {
  DelegatedApprovalCallbackEventPayloadSchema,
  isDelegatedApprovalCallbackEvent,
  TDelegatedApprovalCallbackEventPayload
} from "@app/services/delegated-approval-callback/delegated-approval-callback-events";
import { parseEventPayload, runEventsConcurrentlyByKey } from "@app/services/event-outbox/event-outbox-fns";
import { IEventConsumer, TEvent, TEventConsumerResult } from "@app/services/event-outbox/event-outbox-types";

import {
  DELEGATED_APPROVAL_DECISION_CONCURRENCY,
  DELEGATED_APPROVAL_DECISION_CONSUMER
} from "./delegated-approval-decision-constants";
import { TDelegatedApprovalDecisionServiceFactory } from "./delegated-approval-decision-service";

type TDelegatedApprovalDecisionConsumerDep = {
  delegatedApprovalDecisionService: Pick<TDelegatedApprovalDecisionServiceFactory, "applyDecision">;
};

export const delegatedApprovalDecisionConsumerFactory = ({
  delegatedApprovalDecisionService
}: TDelegatedApprovalDecisionConsumerDep): IEventConsumer<TDelegatedApprovalCallbackEventPayload> => {
  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { data, failure } = parseEventPayload(
      event,
      DelegatedApprovalCallbackEventPayloadSchema,
      "delegated approval callback"
    );
    if (failure) return failure;

    const { delegatedRequestId, externalId } = data;
    const outcome = await delegatedApprovalDecisionService.applyDecision({
      delegatedRequestId,
      externalId,
      isFinalAttempt: event.isFinalAttempt
    });
    return { id: event.id, ...outcome };
  };

  return {
    name: DELEGATED_APPROVAL_DECISION_CONSUMER,
    dataSchema: DelegatedApprovalCallbackEventPayloadSchema,
    subscribesTo: isDelegatedApprovalCallbackEvent,
    handle: (events) =>
      runEventsConcurrentlyByKey(events, {
        keyOf: (event) => DelegatedApprovalCallbackEventPayloadSchema.safeParse(event.data).data?.delegatedRequestId,
        concurrency: DELEGATED_APPROVAL_DECISION_CONCURRENCY,
        handleEvent: $handleEvent
      })
  };
};
