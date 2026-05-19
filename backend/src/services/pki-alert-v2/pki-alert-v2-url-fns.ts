import { TAlertInfo } from "./pki-alert-v2-types";

export const buildAlertViewUrl = (appUrl: string, alert: TAlertInfo): string => {
  const projectBase = `${appUrl}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}`;
  if (alert.applicationId && alert.applicationName) {
    return `${projectBase}/applications/${alert.applicationName}`;
  }
  return `${projectBase}/inventory`;
};
