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
import { TCertDeletionRequestData } from "./cert-deletion-policy-types";

type TCertDeletionApprovalResourceDep = TApplicationApproverChecksDep & {
  certificateService: Pick<TCertificateServiceFactory, "deleteApprovedCertificate">;
};

export const certDeletionApprovalResourceFactory = ({
  certificateService,
  ...approverCheckDeps
}: TCertDeletionApprovalResourceDep): TApprovalResource<
  TCertificateActionPolicyInputs,
  TCertificateActionPolicy,
  TCertDeletionRequestData
> => ({
  ...applicationApproverChecksFactory<TCertificateActionPolicy>(approverCheckDeps, ApprovalPolicyType.CertDeletion),

  buildNotification: buildCertificateActionNotification(ApprovalPolicyType.CertDeletion),

  postApprovalRoutine: async (request) => {
    await certificateService.deleteApprovedCertificate(request);
  }
});
