import { z } from "zod";

import { ServiceNowAccessRequestPayloadSchema } from "./servicenow-schemas";

export type TServiceNowAccessRequestPayload = z.infer<typeof ServiceNowAccessRequestPayloadSchema>;

export type TServiceNowAccessRequestOutcome = {
  sysId: string;
  duplicate: boolean;
};
