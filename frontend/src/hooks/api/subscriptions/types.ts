export type SubscriptionPlan = {
  id: string;
  membersUsed: number;
  memberLimit: number;
  identitiesUsed: number;
  identityLimit: number;
  auditLogs: boolean;
  dynamicSecret: boolean;
  auditLogsRetentionDays: number;
  auditLogStreamLimit: number;
  auditLogStreams: boolean;
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
  oidcSSO: boolean;
  scim: boolean;
  ldap: boolean;
  groups: boolean;
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
  caCrl: boolean;
  instanceUserManagement: boolean;
};
