export type SubscriptionPlan = {
  _id: string;
  membersUsed: number;
  memberLimit: number;
  auditLogs: boolean;
  auditLogsRetentionDays: number;
  customAlerts: boolean;
  customRateLimits: boolean;
  pitRecovery: boolean;
  ipAllowlisting: boolean;
  rbac: boolean;
  secretVersioning: boolean;
  slug: string;
  secretApproval: string;
  secretRotation: string;
  tier: number;
  workspaceLimit: number;
  workspacesUsed: number;
  environmentLimit: number;
  samlSSO: boolean;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | null;
  trial_end: number | null;
  has_used_trial: boolean;
};
