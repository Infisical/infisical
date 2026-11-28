import type { TPrincipal } from "@app/lib/auth/principal";

// Root org's sign-in policy, every session in the org tree has to satisfy it.
export type TActorOrgSsoPolicy = {
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
};

export type TActorOrg = {
  id: string;
  name: string;
  // Same as id for a root org.
  rootOrgId: string;
  parentOrgId: string;
  shouldUseNewPrivilegeSystem: boolean;
  ssoPolicy: TActorOrgSsoPolicy;
};

// The org's audit configuration: how long its plan keeps audit logs. null keeps them without limit, 0 keeps none.
export type TOrgAuditConfig = {
  retentionDays: number | null;
};

// A project's audit configuration. retentionDays is the project's own setting, null when it has none.
export type TProjectAuditConfig = {
  name: string;
  retentionDays: number | null;
};

// Whether the switchable audit event classes are recorded, for the org or for one project.
export type TAuditEventClassSwitches = {
  authentication: boolean;
  authorization: boolean;
};

// Facts about the request the audit log records. Empty outside a request.
export type TAuditOrigin = {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: string;
  // The actor's attributes in the project the request acted in, recorded with a user or identity actor.
  permissionMetadata?: Record<string, unknown>;
};

// Everything the audit log needs to know about the org, its projects and the request. The top level fills it in
// (server/lib/actor-context-builder.ts) so the audit log domain never reads the plan, projects or settings itself.
// Loads on first use and remembers the answer for the life of the context.
export type TActorAuditConfig = {
  org(): Promise<TOrgAuditConfig>;
  // null when the project is not in this org.
  project(projectId: string): Promise<TProjectAuditConfig | null>;
  eventClasses(projectId?: string): Promise<TAuditEventClassSwitches>;
  origin(): TAuditOrigin;
};

// Built once per request by the auth middleware (req.actor), or by actorContextService for queues, crons and
// consumers. No project here on purpose: it depends on the call, not the request, so permission services load it.
// Only the project's audit configuration is, under audit.
export type TActorContextBase = {
  principal: TPrincipal;
  org: TActorOrg;
};

export type TActorContext = TActorContextBase & {
  audit: TActorAuditConfig;
};
