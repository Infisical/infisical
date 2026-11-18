import { randomUUID } from "node:crypto";

import type { TActorContext, TActorOrg, TActorOrgSsoPolicy } from "@app/domains/lib/actor-context";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TIdentityPrincipal, TPrincipal, TUserPrincipal } from "@app/lib/auth/principal";

// A root org with no sign-in policy, unless the test says otherwise.
export const actorOrg = (
  overrides: Partial<Omit<TActorOrg, "ssoPolicy">> & { ssoPolicy?: Partial<TActorOrgSsoPolicy> } = {}
): TActorOrg => {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    name: "acme",
    rootOrgId: id,
    parentOrgId: id,
    shouldUseNewPrivilegeSystem: true,
    ...overrides,
    ssoPolicy: {
      authEnforced: false,
      googleSsoAuthEnforced: false,
      bypassOrgAuthEnabled: false,
      ...overrides.ssoPolicy
    }
  };
};

export const userPrincipal = (overrides: Partial<TUserPrincipal> = {}): TUserPrincipal => ({
  type: ActorType.USER,
  id: randomUUID(),
  username: "ada",
  email: "ada@example.com",
  authMethod: AuthMethod.EMAIL,
  isSuperAdmin: false,
  ...overrides
});

export const identityPrincipal = (overrides: Partial<TIdentityPrincipal> = {}): TIdentityPrincipal => ({
  type: ActorType.IDENTITY,
  id: randomUUID(),
  name: "deployer",
  isInstanceAdmin: false,
  ...overrides
});

// A fresh object each call: permission services memoize per context object, as they do per request.
export const actorContext = ({ principal, org }: { principal: TPrincipal; org: TActorOrg }): TActorContext => ({
  principal,
  org
});
