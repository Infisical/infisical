import type { TPrincipal } from "@app/lib/auth/principal";

// The root org's sign-in policy, which every session in the org tree must satisfy.
export type TActorOrgSsoPolicy = {
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
};

export type TActorOrg = {
  id: string;
  name: string;
  // The org itself for a root org.
  rootOrgId: string;
  parentOrgId: string;
  shouldUseNewPrivilegeSystem: boolean;
  ssoPolicy: TActorOrgSsoPolicy;
};

// Who is acting and in which org, built once per request by the auth middleware (req.permission) and by
// actorContextService for queues, crons and consumers. The project is not here: a permission service loads it from
// the id it is given, because the project depends on the call, not the request.
export type TActorContext = {
  principal: TPrincipal;
  org: TActorOrg;
};
