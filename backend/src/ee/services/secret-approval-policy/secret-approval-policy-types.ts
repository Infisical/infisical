import { EnforcementLevel, TActorInput } from "@app/lib/types";
import { TDelegatedApprovalPolicyInput } from "@app/services/delegated-approval/delegated-approval-types";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";

export type TCreateSapDTO = {
  approvals: number;
  secretPath: string;
  environment?: string;
  environments?: string[];
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
  bypassForMachineIdentities: boolean;
  delegatedApproval?: TDelegatedApprovalPolicyInput;
} & TActorInput;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPath?: string;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  name?: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  bypassForMachineIdentities?: boolean;
  environments?: string[];
  delegatedApproval?: TDelegatedApprovalPolicyInput;
} & TActorInput;

export type TDeleteSapDTO = {
  secretPolicyId: string;
} & TActorInput;

export type TListSapDTO = { projectId: string } & TActorInput;

export type TGetSapByIdDTO = TActorInput & { sapId: string };

export type TGetBoardSapDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
} & TActorInput;
