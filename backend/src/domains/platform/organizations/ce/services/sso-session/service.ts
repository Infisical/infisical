import type { TActorOrg } from "@app/domains/lib/actor-context";
import { isUserPrincipal, TPrincipal } from "@app/lib/auth/principal";

import { Organization } from "../../models/organization";
import { TSsoSessionRefusal } from "../../models/sso-policy";
import { TOrgPermissionService } from "../org-permission/service";

export type TSsoSessionService = {
  // Why the org's sign-in policy refuses the principal's session, after the bypass; null when it allows it (and
  // always for anything but a user). The bypass is looked up only when the policy refuses, and never cached, so
  // revoking it applies on the next request.
  findSsoSessionRefusal(input: { principal: TPrincipal; org: TActorOrg }): Promise<TSsoSessionRefusal | null>;
};

export class SsoSessionService implements TSsoSessionService {
  constructor(private readonly orgPermissionService: TOrgPermissionService) {}

  async findSsoSessionRefusal({ principal, org }: { principal: TPrincipal; org: TActorOrg }) {
    if (!isUserPrincipal(principal)) return null;
    const policy = Organization.fromActorOrg(org).ssoPolicy();
    const refusal = policy.refusalFor({
      authMethod: principal.authMethod,
      sessionRootOrgId: principal.sessionRootOrgId
    });
    if (!refusal) return null;
    if (
      policy.allowsBypass &&
      (await this.orgPermissionService.canBypassSso({ userId: principal.id, rootOrgId: org.rootOrgId }))
    ) {
      return null;
    }
    return refusal;
  }
}
