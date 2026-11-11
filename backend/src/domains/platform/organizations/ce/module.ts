import type { TActorOrg } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import type { TPrincipal } from "@app/lib/auth/principal";
import { NotFoundError } from "@app/lib/errors";

import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { OrgPermission } from "./service/org-access";
import { OrgPermissionService, TGetOrgPermissionInput } from "./service/org-permission-service";
import { SsoSessionCheck, TSsoSessionUser } from "./service/sso-session-check";
import { TSsoSessionRefusal } from "./service/sso-session-policy";

export { OrgPermission } from "./service/org-access";
export type { TGetOrgPermissionInput } from "./service/org-permission-service";
export * from "./service/permission/org-permission";
export type { TSsoSessionUser } from "./service/sso-session-check";
export * from "./service/sso-session-policy";

export type TOrganizationsDomain = {
  // The org facts every request acting in it carries (req.permission.org). Undefined when the org does not exist.
  findActorOrg: (input: { orgId: string }) => Promise<TActorOrg | undefined>;
  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  findRootOrgId: (orgId: string) => Promise<string | null>;
  // The org's root, or the org itself when it does not exist.
  resolveRootOrgId: (orgId: string) => Promise<string>;
  // What the actor may do in its org: its org roles, custom roles and privileges, narrowed for a delegated OAuth
  // token. Refuses another org, a non-member, and the wrong org level for the given scope.
  getOrgPermission: (input: TGetOrgPermissionInput) => Promise<OrgPermission>;
  // Refuses (401) a user session the org's sign-in policy does not allow, unless the user may bypass it. Run once per
  // request, when its actor context is built.
  assertSessionAllowed: (input: { principal: TPrincipal; org: TActorOrg }) => Promise<void>;
  // Why the org's sign-in policy refuses a user's session, after the bypass, or undefined. For flows that check a
  // session against an org other than the request's (selecting an org, OAuth consent, token exchange); they decide
  // the response themselves. Throws NotFound when the org does not exist.
  findSsoSessionRefusal: (input: { user: TSsoSessionUser; orgId: string }) => Promise<TSsoSessionRefusal | undefined>;
};

export type TOrganizationsDeps = {
  db: DataAccessDb;
  accessControlDomain: TAccessControlDomain;
};

// The top-level container: orgs and sub-orgs, and what every request acting in an org needs to know about it.
export class OrganizationsModule {
  readonly name = "organizations";

  readonly service: TOrganizationsDomain;

  constructor({ db, accessControlDomain }: TOrganizationsDeps) {
    const organizations = new OrganizationDataAccess(db);
    const permissions = new OrgPermissionService({ accessControlDomain, memo: new ActorMemo<OrgPermission>() });
    const ssoSessions = new SsoSessionCheck({ canBypassSso: (input) => permissions.canBypassSso(input) });
    this.service = {
      findActorOrg: async ({ orgId }) => {
        const organization = await organizations.findActorOrganization(orgId);
        return organization?.toActorOrg();
      },
      findRootOrgId: (orgId) => organizations.findRootOrgId(orgId),
      resolveRootOrgId: (orgId) => organizations.resolveRootOrgId(orgId),
      getOrgPermission: (input) => permissions.getOrgPermission(input),
      assertSessionAllowed: (input) => ssoSessions.assertSessionAllowed(input),
      findSsoSessionRefusal: async ({ user, orgId }) => {
        const organization = await organizations.findActorOrganization(orgId);
        if (!organization) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
        return ssoSessions.findRefusal({ user, org: organization.toActorOrg() });
      }
    };
  }
}
