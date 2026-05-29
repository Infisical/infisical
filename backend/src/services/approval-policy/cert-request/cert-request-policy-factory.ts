import { logger } from "@app/lib/logger";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";

import { ApprovalPolicyScope } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalRequestFactoryPostApprovalRoutine,
  TApprovalRequestFactoryPostRejectionRoutine,
  TApprovalRequestFactoryValidateConstraints,
  TApprovalResourceFactory
} from "../approval-policy-types";
import {
  TCertRequestApprovalContext,
  TCertRequestPolicy,
  TCertRequestPolicyInputs,
  TCertRequestRequestData
} from "./cert-request-policy-types";

export const certRequestPolicyFactory: TApprovalResourceFactory<
  TCertRequestPolicyInputs,
  TCertRequestPolicy,
  TCertRequestRequestData,
  TCertRequestApprovalContext
> = (policyType) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TCertRequestPolicyInputs, TCertRequestPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId);

    const inputAppId = inputs.applicationId ?? null;
    const expectedScopeType = inputAppId ? ApprovalPolicyScope.PkiApplication : null;
    const expectedScopeId = inputAppId ?? null;
    const candidates = (policies as TCertRequestPolicy[]).filter(
      (p) => p.isActive && (p.scopeType ?? null) === expectedScopeType && (p.scopeId ?? null) === expectedScopeId
    );

    const matched = candidates.find((p) =>
      p.conditions.conditions.some((c) => c.profileNames.includes(inputs.profileName))
    );

    return matched ?? null;
  };

  const canAccess: TApprovalRequestFactoryCanAccess<TCertRequestPolicyInputs> = async () => {
    return null;
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<
    TCertRequestPolicy,
    TCertRequestRequestData
  > = () => {
    return { valid: true };
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine<TCertRequestApprovalContext> = async (
    _approvalRequestGrantsDAL,
    request,
    context
  ) => {
    const { certificateApprovalService, certificateRequestDAL } = context;

    const certRequestData = request.requestData.requestData as TCertRequestRequestData;
    const certReqId = certRequestData.certificateRequestId;

    await certificateRequestDAL.updateById(certReqId, {
      status: CertificateRequestStatus.PENDING,
      approvalRequestId: request.id
    });

    try {
      await certificateApprovalService.issueCertificate(certReqId);
      logger.info(
        { certificateRequestId: certReqId, approvalRequestId: request.id },
        "Certificate issued after approval"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await certificateRequestDAL.updateById(certReqId, {
        status: CertificateRequestStatus.FAILED,
        errorMessage
      });
      logger.error(
        {
          error,
          errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
          certificateRequestId: certReqId,
          approvalRequestId: request.id
        },
        "Failed to issue certificate after approval"
      );
    }
  };

  const postRejectionRoutine: TApprovalRequestFactoryPostRejectionRoutine<TCertRequestApprovalContext> = async (
    request,
    context
  ) => {
    const certRequestData = request.requestData.requestData as TCertRequestRequestData;
    await context.certificateRequestDAL.updateById(certRequestData.certificateRequestId, {
      status: CertificateRequestStatus.REJECTED,
      approvalRequestId: request.id
    });
  };

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine,
    postRejectionRoutine
  };
};
