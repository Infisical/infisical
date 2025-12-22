import { z } from "zod";

import {
  PamAccessPolicyConditionsSchema,
  PamAccessPolicyConstraintsSchema,
  PamAccessPolicyInputsSchema,
  PamAccessPolicyRequestDataSchema,
  PamAccessPolicySchema,
  PamAccessRequestSchema
} from "./pam-access-policy-schemas";

// Policy
export type TPamAccessPolicy = z.infer<typeof PamAccessPolicySchema>;
export type TPamAccessPolicyInputs = z.infer<typeof PamAccessPolicyInputsSchema>;
export type TPamAccessPolicyConditions = z.infer<typeof PamAccessPolicyConditionsSchema>;
export type TPamAccessPolicyConstraints = z.infer<typeof PamAccessPolicyConstraintsSchema>;

// Request
export type TPamAccessRequest = z.infer<typeof PamAccessRequestSchema>;
export type TPamAccessRequestData = z.infer<typeof PamAccessPolicyRequestDataSchema>;
