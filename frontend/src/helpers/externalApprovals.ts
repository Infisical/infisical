import { ExternalApprovalType } from "@app/hooks/api/accessApproval/types";

// the provider catalog itself comes from GET /access-approvals/external-approvals/options;
// only the picker copy lives here
export const EXTERNAL_APPROVAL_DESCRIPTIONS: Record<ExternalApprovalType, string> = {
  [ExternalApprovalType.ServiceNow]: "Approve via ServiceNow change requests"
};
