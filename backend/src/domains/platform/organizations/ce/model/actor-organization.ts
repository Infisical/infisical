import { TOrganizations } from "@app/db/schemas";
import type { TActorOrg } from "@app/domains/lib/actor-context";

export type TActorOrganizationProps = Pick<
  TOrganizations,
  "id" | "name" | "rootOrgId" | "parentOrgId" | "shouldUseNewPrivilegeSystem"
> & {
  // The root org's sign-in policy: a sub-org has none of its own.
  rootAuthEnforced: boolean | null;
  rootGoogleSsoAuthEnforced: boolean | null;
  rootBypassOrgAuthEnabled: boolean | null;
};

// The facts about an org that every request acting in it needs.
export class ActorOrganization {
  private constructor(private readonly props: TActorOrganizationProps) {}

  static restore(props: TActorOrganizationProps): ActorOrganization {
    return new ActorOrganization(props);
  }

  toActorOrg(): TActorOrg {
    const { id, name, rootOrgId, parentOrgId, shouldUseNewPrivilegeSystem } = this.props;
    return {
      id,
      name,
      rootOrgId: rootOrgId ?? id,
      parentOrgId: parentOrgId ?? id,
      shouldUseNewPrivilegeSystem: Boolean(shouldUseNewPrivilegeSystem),
      ssoPolicy: {
        authEnforced: Boolean(this.props.rootAuthEnforced),
        googleSsoAuthEnforced: Boolean(this.props.rootGoogleSsoAuthEnforced),
        bypassOrgAuthEnabled: Boolean(this.props.rootBypassOrgAuthEnabled)
      }
    };
  }
}
