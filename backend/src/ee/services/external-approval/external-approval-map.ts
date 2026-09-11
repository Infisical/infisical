import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";

import { ExternalApprovalType } from "./external-approval-enums";

export const EXTERNAL_APPROVAL_APP_CONNECTION_MAP: Record<ExternalApprovalType, AppConnection> = {
  [ExternalApprovalType.ServiceNow]: AppConnection.ServiceNow
};

export const EXTERNAL_APPROVAL_APP_CONNECTIONS: readonly AppConnection[] = Object.values(
  EXTERNAL_APPROVAL_APP_CONNECTION_MAP
);

export const listExternalApprovalOptions = () =>
  Object.values(ExternalApprovalType).map((type) => {
    const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[type];

    return { type, app, name: APP_CONNECTION_NAME_MAP[app] };
  });

export const getExternalApprovalProviderName = (type: string) => {
  const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[type as ExternalApprovalType];
  if (!app) return type;

  return APP_CONNECTION_NAME_MAP[app];
};
