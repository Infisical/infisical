import { OrganizationActionScope } from "@app/db/schemas";
import type { TActorOrg } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";

import { SsoPolicy } from "./sso-policy";

// The org a request acts in, as the auth middleware loaded it.
export class Organization {
  private constructor(private readonly org: TActorOrg) {}

  static fromActorOrg(org: TActorOrg): Organization {
    return new Organization({ ...org, ssoPolicy: { ...org.ssoPolicy } });
  }

  get id(): string {
    return this.org.id;
  }

  get rootOrgId(): string {
    return this.org.rootOrgId;
  }

  isSubOrg(): boolean {
    return this.org.rootOrgId !== this.org.id;
  }

  // Refuses a sub-org for parent-only operations, and a root org for child-only ones.
  assertLevel(scope: OrganizationActionScope): void {
    if (scope === OrganizationActionScope.ParentOrganization && this.isSubOrg()) {
      throw new PermissionDeniedError({ message: "Child organization cannot do this operation" });
    }
    if (scope === OrganizationActionScope.ChildOrganization && !this.isSubOrg()) {
      throw new PermissionDeniedError({ message: "Parent organization cannot do this operation" });
    }
  }

  // The root org's sign-in policy, which every session in the org tree must satisfy.
  ssoPolicy(): SsoPolicy {
    return SsoPolicy.restore({ rootOrgId: this.org.rootOrgId, ...this.org.ssoPolicy });
  }
}
