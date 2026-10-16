import { z } from "zod";

import { ServiceNowAccessRequestPayloadSchema, ServiceNowAccessRequestRecordSchema } from "./servicenow-schemas";

export type TServiceNowAccessRequestPayload = z.infer<typeof ServiceNowAccessRequestPayloadSchema>;

export type TServiceNowAccessRequestRecord = z.infer<typeof ServiceNowAccessRequestRecordSchema>;

export type TServiceNowAccessRequestOutcome = {
  sysId: string;
  duplicate: boolean;
};
