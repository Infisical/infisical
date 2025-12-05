import { ApprovalPolicyType } from "./approval-policy-enums";
import { TApprovalPolicy, TApprovalPolicyInputs, TApprovalResourceFactory } from "./approval-policy-types";
import { pamAccessPolicyFactory } from "./pam-access/pam-access-policy-factory";

type TApprovalPolicyFactoryImplementation = TApprovalResourceFactory<TApprovalPolicyInputs, TApprovalPolicy>;

export const APPROVAL_POLICY_FACTORY_MAP: Record<ApprovalPolicyType, TApprovalPolicyFactoryImplementation> = {
  [ApprovalPolicyType.PamAccess]: pamAccessPolicyFactory as TApprovalPolicyFactoryImplementation
};
