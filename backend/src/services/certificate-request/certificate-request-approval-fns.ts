import { Knex } from "knex";

import { ms } from "@app/lib/ms";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "../approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "../approval-policy/approval-policy-service";
import { TCertRequestPolicy, TCertRequestRequestData } from "../approval-policy/cert-request/cert-request-policy-types";
import { ActorType } from "../auth/auth-type";
import { TCertificateRequestDALFactory } from "./certificate-request-dal";

export type TCertificateRequestApprovalPolicy = TCertRequestPolicy & {
  steps: Awaited<ReturnType<TApprovalPolicyDALFactory["findStepsByPolicyId"]>>;
};

export const matchCertificateRequestApprovalPolicy = async (
  {
    approvalPolicyService,
    approvalPolicyDAL
  }: {
    approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "matchPolicy">;
    approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findStepsByPolicyId">;
  },
  {
    projectId,
    profileName,
    applicationId,
    actor
  }: {
    projectId: string;
    profileName: string;
    applicationId?: string | null;
    actor: ActorType;
  }
): Promise<TCertificateRequestApprovalPolicy | null> => {
  const policy = (await approvalPolicyService.matchPolicy(ApprovalPolicyType.CertRequest, projectId, {
    profileName,
    applicationId: applicationId ?? undefined
  })) as TCertRequestPolicy | null;

  if (!policy) return null;
  if (actor === ActorType.IDENTITY && policy.bypassForMachineIdentities === true) return null;

  return {
    ...policy,
    steps: await approvalPolicyDAL.findStepsByPolicyId(policy.id)
  };
};

export const holdCertificateRequestForApproval = async (
  {
    certificateRequestDAL,
    approvalPolicyService
  }: {
    certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById">;
    approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "createRequestFromPolicy">;
  },
  {
    approvalPolicy,
    projectId,
    organizationId,
    createCertificateRequest,
    requestData,
    justification,
    requester,
    tx
  }: {
    approvalPolicy: TCertificateRequestApprovalPolicy;
    projectId: string;
    organizationId: string;
    createCertificateRequest: () => Promise<{ id: string }>;
    requestData: Omit<TCertRequestRequestData, "certificateRequestId">;
    justification: string;
    requester: { actor: ActorType; actorId: string; name: string; email: string };
    tx: Knex;
  }
) => {
  const certificateRequest = await createCertificateRequest();

  const { request: approvalRequest, notifyApprovers } = await approvalPolicyService.createRequestFromPolicy({
    projectId,
    organizationId,
    policy: approvalPolicy,
    requestData: {
      ...requestData,
      certificateRequestId: certificateRequest.id
    },
    justification,
    expiresAt: approvalPolicy.maxRequestTtl ? new Date(Date.now() + ms(approvalPolicy.maxRequestTtl)) : null,
    requesterUserId: requester.actor === ActorType.USER ? requester.actorId : null,
    machineIdentityId: requester.actor === ActorType.IDENTITY ? requester.actorId : null,
    requesterName: requester.name,
    requesterEmail: requester.email,
    deferApproverNotification: true,
    tx
  });

  await certificateRequestDAL.updateById(certificateRequest.id, { approvalRequestId: approvalRequest.id }, tx);

  return {
    certificateRequestId: certificateRequest.id,
    approvalRequestId: approvalRequest.id,
    notifyApprovers
  };
};
