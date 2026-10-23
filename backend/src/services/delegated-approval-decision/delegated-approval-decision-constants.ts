import { MAX_OUTBOX_ATTEMPTS } from "@app/services/event-outbox/event-outbox-types";

export const DELEGATED_APPROVAL_DECISION_CONSUMER = "delegated-approval-decision";

export const DELEGATED_APPROVAL_DECISION_CONCURRENCY = 10;

export const DELEGATED_APPROVAL_DECISION_RETRY_HINT =
  "Infisical will check again automatically. If this does not change, send the decision again from the delegated approval system.";

export const DELEGATED_APPROVAL_DECISION_STOPPED_HINT = `Infisical stopped checking after ${MAX_OUTBOX_ATTEMPTS} attempts and will not check again on its own. Send the callback to Infisical again from the delegated approval system to finish the request.`;
