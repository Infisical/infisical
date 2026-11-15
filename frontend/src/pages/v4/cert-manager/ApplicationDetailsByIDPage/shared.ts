import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";

import type { PkiApplicationPermission } from "../../data/pki-applications/contract";

export type ApplicationTab = "certificates" | "requests" | "syncs" | "members" | "settings";

export const appCan = (
  access: PkiApplicationPermission | undefined,
  action: PkiApplicationResourceActions,
  subject: PkiApplicationResourceSub
) => Boolean(access?.permission.can(action, subject));

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const copyId = (id: string) => navigator.clipboard?.writeText(id).catch(() => undefined);

export const APP_ROLES = [
  { value: "admin", label: "Admin", description: "Manage members, profiles and policies" },
  { value: "operator", label: "Operator", description: "Issue certificates and submit requests" },
  { value: "auditor", label: "Auditor", description: "View certificates and activity" }
];

const PKI_DOCS = "https://infisical.com/docs/documentation/platform/pki/applications";

export const APPLICATION_DOCS = {
  overview: `${PKI_DOCS}/overview`,
  approvals: `${PKI_DOCS}/approvals`,
  enrollment: `${PKI_DOCS}/enrollment-methods/overview`,
  alerting: `${PKI_DOCS}/alerting/overview`
};

const ALERT_BEFORE_UNITS: Record<string, string> = { d: "day", w: "week", m: "month", y: "year" };

export const formatAlertBefore = (alertBefore?: string | null) => {
  if (!alertBefore) return "None";
  const match = alertBefore.trim().match(/^(\d{1,4})([dwmy])$/);
  if (!match) return alertBefore;
  const value = Number(match[1]);
  return `${value} ${ALERT_BEFORE_UNITS[match[2]]}${value === 1 ? "" : "s"}`;
};
