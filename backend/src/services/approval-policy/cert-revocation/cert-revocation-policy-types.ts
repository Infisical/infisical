import { z } from "zod";

import {
  CertRevocationPolicyConditionsSchema,
  CertRevocationPolicyConstraintsSchema,
  CertRevocationPolicyInputsSchema,
  CertRevocationPolicyRequestDataSchema,
  CertRevocationPolicySchema,
  CertRevocationRequestSchema
} from "./cert-revocation-policy-schemas";

export type TCertRevocationPolicy = z.infer<typeof CertRevocationPolicySchema>;
export type TCertRevocationPolicyInputs = z.infer<typeof CertRevocationPolicyInputsSchema>;
export type TCertRevocationPolicyConditions = z.infer<typeof CertRevocationPolicyConditionsSchema>;
export type TCertRevocationPolicyConstraints = z.infer<typeof CertRevocationPolicyConstraintsSchema>;

export type TCertRevocationRequest = z.infer<typeof CertRevocationRequestSchema>;
export type TCertRevocationRequestData = z.infer<typeof CertRevocationPolicyRequestDataSchema>;
