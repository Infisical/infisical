import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorType } from "@app/lib/auth/actor-types";
import { delegatedOauthScopesOf, TPrincipal } from "@app/lib/auth/principal";

// Who may read billing beyond their own org. A self-hosted license covers every org on the instance, so its instance
// admins read any org's billing. Cloud orgs are separate customers, and a token narrowed to some OAuth scopes never
// carries instance-admin reach.
export class BillingAccess {
  private constructor(
    private readonly isInstanceAdmin: boolean,
    private readonly isScopeNarrowed: boolean,
    private readonly isCloud: boolean
  ) {}

  static of(principal: TPrincipal, isCloud: boolean): BillingAccess {
    const isInstanceAdmin =
      (principal.type === ActorType.USER && principal.isSuperAdmin) ||
      (principal.type === ActorType.IDENTITY && principal.isInstanceAdmin);
    return new BillingAccess(isInstanceAdmin, delegatedOauthScopesOf(principal) !== undefined, isCloud);
  }

  canReadAcrossOrgs(): boolean {
    return this.isInstanceAdmin && !this.isCloud && !this.isScopeNarrowed;
  }

  // An org the actor isn't signed in to, read through instance-admin reach instead of org membership.
  readsWithoutMembership(orgId: string, actorOrgId: string): boolean {
    return orgId !== actorOrgId && this.canReadAcrossOrgs();
  }

  assertInstanceWide(): void {
    if (!this.canReadAcrossOrgs()) {
      throw new PermissionDeniedError({
        message: "Instance-wide usage can only be read by an instance admin on a self-hosted instance."
      });
    }
  }
}
