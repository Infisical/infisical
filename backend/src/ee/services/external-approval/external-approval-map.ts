import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ExternalApprovalType } from "./external-approval-enums";

export const EXTERNAL_APPROVAL_APP_CONNECTION_MAP: Record<ExternalApprovalType, AppConnection> = {
  [ExternalApprovalType.ServiceNow]: AppConnection.ServiceNow
};

export const EXTERNAL_APPROVAL_APP_CONNECTIONS: readonly AppConnection[] = Object.values(
  EXTERNAL_APPROVAL_APP_CONNECTION_MAP
);
