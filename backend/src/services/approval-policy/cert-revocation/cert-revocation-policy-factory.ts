import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";

import { ApprovalPolicyType } from "../approval-policy-enums";
import { TApprovalResource } from "../approval-policy-types";
import {
  applicationApproverChecksFactory,
  TApplicationApproverChecksDep
} from "../pki-approvers/application-policy-checks";
import { buildCertificateActionNotification } from "../pki-approvers/certificate-action-notification";
import {
  TCertificateActionPolicy,
  TCertificateActionPolicyInputs
} from "../pki-approvers/certificate-action-policy-types";
import { TCertRevocationRequestData } from "./cert-revocation-policy-types";

type TCertRevocationApprovalResourceDep = TApplicationApproverChecksDep & {
  certificateService: Pick<TCertificateServiceFactory, "revokeApprovedCertificate">;
};

export const certRevocationApprovalResourceFactory = ({
  certificateService,
  ...approverCheckDeps
}: TCertRevocationApprovalResourceDep): TApprovalResource<
  TCertificateActionPolicyInputs,
  TCertificateActionPolicy,
  TCertRevocationRequestData
> => ({
  ...applicationApproverChecksFactory<TCertificateActionPolicy>(approverCheckDeps, ApprovalPolicyType.CertRevocation),

  buildNotification: buildCertificateActionNotification(ApprovalPolicyType.CertRevocation),

  postApprovalRoutine: async (request) => {
    await certificateService.revokeApprovedCertificate(request);
  }
});
