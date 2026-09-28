import { TAlertInfo } from "./pki-alert-v2-types";

export const buildAlertViewUrl = (appUrl: string, alert: TAlertInfo): string =>
  `${appUrl}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}/inventory`;
