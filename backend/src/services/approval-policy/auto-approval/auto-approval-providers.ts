import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TAutoApprovalProvider } from "./auto-approval-types";
import { INCIDENT_IO_AUTO_APPROVAL_PROVIDER } from "./providers/incident-io-auto-approval-provider";
import { JIRA_AUTO_APPROVAL_PROVIDER } from "./providers/jira-auto-approval-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AUTO_APPROVAL_PROVIDER_REGISTRY: Partial<Record<AppConnection, TAutoApprovalProvider<any>>> = {
  [AppConnection.Jira]: JIRA_AUTO_APPROVAL_PROVIDER,
  [AppConnection.IncidentIo]: INCIDENT_IO_AUTO_APPROVAL_PROVIDER
};

export const AUTO_APPROVAL_APPS = Object.keys(AUTO_APPROVAL_PROVIDER_REGISTRY) as AppConnection[];

const offersSubject = (app: AppConnection, isField: boolean) =>
  Object.values(AUTO_APPROVAL_PROVIDER_REGISTRY[app]?.subjects ?? {}).some(
    (subject) => Boolean(subject.input) === isField
  );

// Apps that add a request form field, and apps whose rules check the requester
export const AUTO_APPROVAL_FIELD_APPS = AUTO_APPROVAL_APPS.filter((app) => offersSubject(app, true));
export const AUTO_APPROVAL_REQUESTER_APPS = AUTO_APPROVAL_APPS.filter((app) => offersSubject(app, false));

export const getAutoApprovalProvider = (app: string) => AUTO_APPROVAL_PROVIDER_REGISTRY[app as AppConnection];
