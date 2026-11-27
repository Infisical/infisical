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

// Built once per request by the auth middleware (req.actor), or by actorContextService for queues, crons and
// consumers. No project here on purpose: it depends on the call, not the request, so permission services load it.
export type TActorContext = {
  principal: TPrincipal;
  org: TActorOrg;
};
