import type { TActorOrg } from "@app/domains/lib/actor-context";
import { isUserPrincipal, TPrincipal } from "@app/lib/auth/principal";
import { UnauthorizedError } from "@app/lib/errors";

import { ssoSessionRefusal } from "./sso-session-policy";

export type TSsoSessionCheckDeps = {
  canBypassSso: (input: { userId: string; rootOrgId: string }) => Promise<boolean>;
};

export class SsoSessionCheck {
  constructor(private readonly deps: TSsoSessionCheckDeps) {}

  // Refuses a user session the org's current sign-in policy does not allow, like an expired token: enforcement
  // turned on after sign-in, or a session another org's IdP issued. The bypass is looked up only when the policy
  // refuses, and never cached, so revoking it applies on the next request.
  async assertSessionAllowed({ principal, org }: { principal: TPrincipal; org: TActorOrg }): Promise<void> {
    if (!isUserPrincipal(principal)) return;
    const refusal = ssoSessionRefusal({
      authMethod: principal.authMethod,
      sessionRootOrgId: principal.sessionRootOrgId,
      rootOrgId: org.rootOrgId,
      policy: org.ssoPolicy
    });
    if (!refusal) return;
    if (
      org.ssoPolicy.bypassOrgAuthEnabled &&
      (await this.deps.canBypassSso({ userId: principal.id, rootOrgId: org.rootOrgId }))
    ) {
      return;
    }
    throw new UnauthorizedError({ name: refusal.name, message: refusal.message });
  }
}
