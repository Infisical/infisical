import { DelegatedApprovalPolicyType } from "@app/hooks/api/delegatedApprovals/enums";

export const DELEGATED_APPROVAL_DOCS_MAP: Record<
  DelegatedApprovalPolicyType,
  { connection: string; setup: string }
> = {
  [DelegatedApprovalPolicyType.ServiceNow]: {
    connection: "https://infisical.com/docs/integrations/app-connections/servicenow",
    setup:
      "https://infisical.com/docs/documentation/platform/workflow-integrations/servicenow-integration"
  }
};
