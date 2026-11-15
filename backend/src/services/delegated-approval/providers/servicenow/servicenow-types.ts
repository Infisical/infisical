import { z } from "zod";

import { ServiceNowRequestOperation } from "./servicenow-enums";
import { ServiceNowAccessRequestPayloadSchema } from "./servicenow-schemas";

export type TServiceNowAccessRequestPayload = z.infer<typeof ServiceNowAccessRequestPayloadSchema>;

export type TServiceNowAccessRequestOutcome = {
  sysId: string;
  recordNumber: string | null;
  duplicate: boolean;
};

export type TServiceNowRequestFailureContext = {
  instanceUrl: string;
  connectionId: string;
  operation: ServiceNowRequestOperation;
  action: string;
  delegatedRequestId: string;
  approvalRequestId: string;
};
