import type { TActorOrg } from "@app/domains/lib/actor-context";
import { isUserPrincipal, TPrincipal, TUserPrincipal } from "@app/lib/auth/principal";
import { UnauthorizedError } from "@app/lib/errors";

import { ssoSessionRefusal, TSsoSessionRefusal } from "./sso-session-policy";

export type TSsoSessionUser = {
  id: string;
  authMethod: TUserPrincipal["authMethod"];
  sessionRootOrgId?: string;
};

export type TSsoSessionCheckDeps = {
  canBypassSso: (input: { userId: string; rootOrgId: string }) => Promise<boolean>;
};

export class SsoSessionCheck {
  constructor(private readonly deps: TSsoSessionCheckDeps) {}

  // Why the org's sign-in policy refuses the user's session, after the bypass; undefined when it allows it. The bypass
  // is looked up only when the policy refuses, and never cached, so revoking it applies on the next request.
  async findRefusal({ user, org }: { user: TSsoSessionUser; org: TActorOrg }): Promise<TSsoSessionRefusal | undefined> {
    const refusal = ssoSessionRefusal({
      authMethod: user.authMethod,
      sessionRootOrgId: user.sessionRootOrgId,
      rootOrgId: org.rootOrgId,
      policy: org.ssoPolicy
    });
    if (!refusal) return undefined;
    if (
      org.ssoPolicy.bypassOrgAuthEnabled &&
      (await this.deps.canBypassSso({ userId: user.id, rootOrgId: org.rootOrgId }))
    ) {
      return undefined;
    }
    return refusal;
  }

  // Refuses a user session the org's current sign-in policy does not allow, like an expired token: enforcement
  // turned on after sign-in, or a session another org's IdP issued.
  async assertSessionAllowed({ principal, org }: { principal: TPrincipal; org: TActorOrg }): Promise<void> {
    if (!isUserPrincipal(principal)) return;
    const refusal = await this.findRefusal({ user: principal, org });
    if (refusal) throw new UnauthorizedError({ name: refusal.name, message: refusal.message });
  }
}
