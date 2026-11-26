import { Grant } from "./grant";
import { Membership, TMembershipRecord } from "./membership";
import { Privilege, TPrivilegeRecord } from "./privilege";

export type TIdentityAttributeRecord = { id: string; key: string; value: string };

export type TActorGrantsRecord = {
  memberships: TMembershipRecord[];
  privileges: TPrivilegeRecord[];
  attributes: TIdentityAttributeRecord[];
  // An identity's current name, for `{{identity.username}}` conditions. Null for a user, whose username comes from
  // the session, and at a resource scope.
  actorName?: string | null;
};

// One actor's memberships (direct and via groups), privileges and attributes at a scope. What they actually grant
// is up to the scope owner.
export class ActorGrants {
  private constructor(
    readonly memberships: Membership[],
    private readonly privileges: Privilege[],
    private readonly attributes: TIdentityAttributeRecord[],
    readonly actorName: string | null
  ) {}

  static restore({ memberships, privileges, attributes, actorName }: TActorGrantsRecord): ActorGrants {
    return new ActorGrants(
      memberships.map((membership) => Membership.restore(membership)),
      privileges.map((privilege) => Privilege.restore(privilege)),
      attributes.map((attribute) => ({ ...attribute })),
      actorName ?? null
    );
  }

  static empty(): ActorGrants {
    return new ActorGrants([], [], [], null);
  }

  get hasMembership(): boolean {
    return this.memberships.length > 0;
  }

  // Roles first, then privileges.
  active(now: Date = new Date()): Grant[] {
    const roles = this.memberships.flatMap((membership) => membership.activeRoles(now).map((role) => role.toGrant()));
    return roles.concat(this.activePrivileges(now).map((privilege) => privilege.toGrant()));
  }

  // For privilege boundary checks: roles deduped by effective slug, minus the ones that grant nothing, then privileges.
  distinctActiveGrants({ grantsNothing, now = new Date() }: { grantsNothing: string[]; now?: Date }): Grant[] {
    return this.distinctActiveRoleGrants({ grantsNothing, now }).concat(
      this.activePrivileges(now).map((privilege) => privilege.toGrant())
    );
  }

  // Roles only, for owners that read privileges from a different table.
  distinctActiveRoleGrants({ grantsNothing, now = new Date() }: { grantsNothing: string[]; now?: Date }): Grant[] {
    const seen = new Set<string>(grantsNothing);
    return this.memberships
      .flatMap((membership) => membership.activeRoles(now))
      .filter((role) => {
        const slug = role.effectiveSlug;
        if (seen.has(slug)) return false;
        seen.add(slug);
        return true;
      })
      .map((role) => role.toGrant());
  }

  activePrivileges(now: Date = new Date()): Privilege[] {
    return this.privileges.filter((privilege) => privilege.isActive(now));
  }

  // Matches a custom role's own slug too. Use hasActiveBuiltInRole when that must not count.
  hasActiveRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) =>
      membership.activeRoles(now).some((role) => role.effectiveSlug === slug)
    );
  }

  // A custom role with the same slug never matches.
  hasActiveBuiltInRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) => membership.activeRoles(now).some((role) => role.isBuiltIn(slug)));
  }

  attributeMap(): Record<string, string> {
    return Object.fromEntries(this.attributes.map((attribute) => [attribute.key, attribute.value]));
  }

  // Combines grants from several scopes (e.g. a folder and an account in it).
  merge(other: ActorGrants): ActorGrants {
    return new ActorGrants(
      [...this.memberships, ...other.memberships],
      [...this.privileges, ...other.privileges],
      [...this.attributes, ...other.attributes],
      this.actorName ?? other.actorName
    );
  }

  toJSON(): TActorGrantsRecord {
    return {
      memberships: this.memberships.map((membership) => membership.toJSON()),
      privileges: this.privileges.map((privilege) => privilege.toJSON()),
      attributes: this.attributes.map((attribute) => ({ ...attribute })),
      actorName: this.actorName
    };
  }
}
