import { ApprovalPolicyType } from "./approval-policy-enums";
import {
  TApprovalPolicy,
  TApprovalPolicyInputs,
  TApprovalRequestData,
  TApprovalResourceFactory
} from "./approval-policy-types";
import { certRequestPolicyFactory } from "./cert-request/cert-request-policy-factory";
import { pamAccessPolicyFactory } from "./pam-access/pam-access-policy-factory";

type TApprovalPolicyFactoryImplementation = TApprovalResourceFactory<
  TApprovalPolicyInputs,
  TApprovalPolicy,
  TApprovalRequestData
>;

export const APPROVAL_POLICY_FACTORY_MAP: Record<ApprovalPolicyType, TApprovalPolicyFactoryImplementation> = {
  [ApprovalPolicyType.PamAccess]: pamAccessPolicyFactory as TApprovalPolicyFactoryImplementation,
  [ApprovalPolicyType.CertRequest]: certRequestPolicyFactory as TApprovalPolicyFactoryImplementation
};
