import { z } from "zod";

import {
  CertRequestPolicyConditionsSchema,
  CertRequestPolicyConstraintsSchema,
  CertRequestPolicyInputsSchema,
  CertRequestPolicyRequestDataSchema,
  CertRequestPolicySchema,
  CertRequestRequestSchema
} from "./cert-request-policy-schemas";

export type TCertRequestPolicy = z.infer<typeof CertRequestPolicySchema>;
export type TCertRequestPolicyInputs = z.infer<typeof CertRequestPolicyInputsSchema>;
export type TCertRequestPolicyConditions = z.infer<typeof CertRequestPolicyConditionsSchema>;
export type TCertRequestPolicyConstraints = z.infer<typeof CertRequestPolicyConstraintsSchema>;

export type TCertRequestRequest = z.infer<typeof CertRequestRequestSchema>;
export type TCertRequestRequestData = z.infer<typeof CertRequestPolicyRequestDataSchema>;
