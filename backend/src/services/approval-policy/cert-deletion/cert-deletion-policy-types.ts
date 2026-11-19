import { z } from "zod";

import { TMatchedApplicationPolicy } from "../cert-revocation/application-approver-checks";
import {
  CertDeletionPolicyConditionsSchema,
  CertDeletionPolicyConstraintsSchema,
  CertDeletionPolicyInputsSchema,
  CertDeletionPolicyRequestDataSchema,
  CertDeletionPolicySchema,
  CertDeletionRequestSchema
} from "./cert-deletion-policy-schemas";

export type TCertDeletionPolicy = z.infer<typeof CertDeletionPolicySchema>;
export type TCertDeletionPolicyInputs = z.infer<typeof CertDeletionPolicyInputsSchema>;
export type TCertDeletionPolicyConditions = z.infer<typeof CertDeletionPolicyConditionsSchema>;
export type TCertDeletionPolicyConstraints = z.infer<typeof CertDeletionPolicyConstraintsSchema>;

export type TCertDeletionRequest = z.infer<typeof CertDeletionRequestSchema>;
export type TCertDeletionRequestData = z.infer<typeof CertDeletionPolicyRequestDataSchema>;

export type TMatchedCertDeletionPolicy = TMatchedApplicationPolicy<TCertDeletionPolicy>;
