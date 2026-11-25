import { Knex } from "knex";

import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyType, CertRequestPolicyOperation } from "../approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "../approval-policy/approval-policy-service";
import { parseCertRequestPolicyOperation } from "../approval-policy/cert-request/cert-request-policy-schemas";
import { TCertRequestPolicy, TCertRequestRequestData } from "../approval-policy/cert-request/cert-request-policy-types";
import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateRequestDALFactory } from "./certificate-request-dal";

export type TCertificateRequestApprovalPolicy = TCertRequestPolicy & {
  steps: Awaited<ReturnType<TApprovalPolicyDALFactory["findStepsByPolicyId"]>>;
};

// Locks the certificate first, so two renewals of it submitted at once can't both pass and each raise a request.
export const assertNoRenewalAwaitingApproval = async (
  certificateDAL: Pick<TCertificateDALFactory, "findByIdForUpdate" | "hasRenewalAwaitingApproval">,
  certificate: { certificateId: string; projectId: string },
  tx: Knex
) => {
  const lockedCertificate = await certificateDAL.findByIdForUpdate(certificate.certificateId, tx);
  if (await certificateDAL.hasRenewalAwaitingApproval(certificate, tx)) {
    throw new BadRequestError({ message: "A renewal of this certificate is already waiting for approval." });
  }
  return lockedCertificate;
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
    actor,
    operation = CertRequestPolicyOperation.Issuance
  }: {
    projectId: string;
    profileName: string;
    applicationId?: string | null;
    actor: ActorType;
    operation?: CertRequestPolicyOperation;
  }
): Promise<TCertificateRequestApprovalPolicy | null> => {
  const findPolicy = async (policyOperation: CertRequestPolicyOperation) =>
    (await approvalPolicyService.matchPolicy(ApprovalPolicyType.CertRequest, projectId, {
      profileName,
      operation: policyOperation,
      applicationId: applicationId ?? undefined
    })) as TCertRequestPolicy | null;

  let policy = await findPolicy(operation);

  if (!policy) return null;
  if (actor === ActorType.IDENTITY && policy.bypassForMachineIdentities === true) {
    // A Renewal policy's bypass can't waive what an Issuance policy covering the profile would hold, such as a
    // renewal that changes the certificate, so the caller applies the Issuance policy's own rules instead.
    if (parseCertRequestPolicyOperation(policy) !== CertRequestPolicyOperation.Renewal) return null;
    policy = await findPolicy(CertRequestPolicyOperation.Issuance);
    if (!policy || policy.bypassForMachineIdentities === true) return null;
  }

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
