import { z } from "zod";

import {
  PamAccessPolicyConditionsSchema,
  PamAccessPolicyConstraintsSchema,
  PamAccessPolicyInputsSchema,
  PamAccessPolicySchema
} from "./pam-access-policy-schemas";

export type TPamAccessPolicy = z.infer<typeof PamAccessPolicySchema>;
export type TPamAccessPolicyInputs = z.infer<typeof PamAccessPolicyInputsSchema>;
export type TPamAccessPolicyConditions = z.infer<typeof PamAccessPolicyConditionsSchema>;
export type TPamAccessPolicyConstraints = z.infer<typeof PamAccessPolicyConstraintsSchema>;
