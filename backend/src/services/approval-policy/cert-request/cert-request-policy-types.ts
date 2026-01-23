import { z } from "zod";

import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";

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

export type TCertRequestApprovalContext = {
  certificateApprovalService: TCertificateApprovalService;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
};
