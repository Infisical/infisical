import { z } from "zod";

import { TMatchedApplicationPolicy } from "./application-policy-checks";
import {
  CertificateActionPolicyConditionsSchema,
  CertificateActionPolicyConstraintsSchema,
  CertificateActionPolicyInputsSchema,
  CertificateActionPolicySchema
} from "./certificate-action-policy-schemas";

export type TCertificateActionPolicy = z.infer<typeof CertificateActionPolicySchema>;
export type TCertificateActionPolicyInputs = z.infer<typeof CertificateActionPolicyInputsSchema>;
export type TCertificateActionPolicyConditions = z.infer<typeof CertificateActionPolicyConditionsSchema>;
export type TCertificateActionPolicyConstraints = z.infer<typeof CertificateActionPolicyConstraintsSchema>;

export type TMatchedCertificateActionPolicy = TMatchedApplicationPolicy<TCertificateActionPolicy>;
