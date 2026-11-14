import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TAutoApprovalProvider } from "./auto-approval-types";
import { JIRA_AUTO_APPROVAL_PROVIDER } from "./providers/jira-auto-approval-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AUTO_APPROVAL_PROVIDER_REGISTRY: Partial<Record<AppConnection, TAutoApprovalProvider<any>>> = {
  [AppConnection.Jira]: JIRA_AUTO_APPROVAL_PROVIDER
};

export const AUTO_APPROVAL_APPS = Object.keys(AUTO_APPROVAL_PROVIDER_REGISTRY) as AppConnection[];

export const getAutoApprovalProvider = (app: string) => AUTO_APPROVAL_PROVIDER_REGISTRY[app as AppConnection];
