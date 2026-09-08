import { ExternalApprovalType } from "@app/hooks/api/accessApproval/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const EXTERNAL_APPROVAL_TYPE_MAP: Record<
  ExternalApprovalType,
  { name: string; description: string; app: AppConnection }
> = {
  [ExternalApprovalType.ServiceNow]: {
    name: "ServiceNow",
    description: "Approve via ServiceNow change requests",
    app: AppConnection.ServiceNow
  }
};

export const EXTERNAL_APPROVAL_TYPES = Object.values(ExternalApprovalType);
