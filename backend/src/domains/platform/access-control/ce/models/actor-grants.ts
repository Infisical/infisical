import { Grant } from "./grant";
import { Membership, TMembershipRecord } from "./membership";
import { Privilege, TPrivilegeRecord } from "./privilege";

export type TIdentityAttributeRecord = { id: string; key: string; value: string };

export type TActorGrantsRecord = {
  memberships: TMembershipRecord[];
  privileges: TPrivilegeRecord[];
  attributes: TIdentityAttributeRecord[];
};

// What one user or identity holds at one scope: its memberships there (direct and through groups) with their
// roles, its privileges at that scope, and its attributes. What any of it grants is the scope owner's call.
export class ActorGrants {
  private constructor(
    readonly memberships: Membership[],
    private readonly privileges: Privilege[],
    private readonly attributes: TIdentityAttributeRecord[]
  ) {}

  static restore({ memberships, privileges, attributes }: TActorGrantsRecord): ActorGrants {
    return new ActorGrants(
      memberships.map((membership) => Membership.restore(membership)),
      privileges.map((privilege) => Privilege.restore(privilege)),
      attributes.map((attribute) => ({ ...attribute }))
    );
  }

  static empty(): ActorGrants {
    return new ActorGrants([], [], []);
  }

  get hasMembership(): boolean {
    return this.memberships.length > 0;
  }

  // Every role and privilege in force now: each membership's roles, then the privileges.
  active(now: Date = new Date()): Grant[] {
    const roles = this.memberships.flatMap((membership) => membership.activeRoles(now).map((role) => role.toGrant()));
    return roles.concat(this.activePrivileges(now).map((privilege) => privilege.toGrant()));
  }

  // What a privilege boundary compares an actor against: each distinct role it holds now (by the slug it is known
  // by), leaving out the slugs the scope owner says grant nothing, then each privilege in force.
  distinctActiveGrants({ grantsNothing, now = new Date() }: { grantsNothing: string[]; now?: Date }): Grant[] {
    return this.distinctActiveRoleGrants({ grantsNothing, now }).concat(
      this.activePrivileges(now).map((privilege) => privilege.toGrant())
    );
  }

  // The roles half of distinctActiveGrants, for an owner that reads roles and privileges with different tables.
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

  // Whether an active role carries this slug: a custom role's own slug, or a built-in slug.
  hasActiveRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) =>
      membership.activeRoles(now).some((role) => role.effectiveSlug === slug)
    );
  }

  // Whether an active role is this built-in slug. A custom role slugged the same never matches.
  hasActiveBuiltInRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) => membership.activeRoles(now).some((role) => role.isBuiltIn(slug)));
  }

  attributeMap(): Record<string, string> {
    return Object.fromEntries(this.attributes.map((attribute) => [attribute.key, attribute.value]));
  }

  // The grants of several scopes held together (a folder and an account in it).
  merge(other: ActorGrants): ActorGrants {
    return new ActorGrants(
      [...this.memberships, ...other.memberships],
      [...this.privileges, ...other.privileges],
      [...this.attributes, ...other.attributes]
    );
  }

  toJSON(): TActorGrantsRecord {
    return {
      memberships: this.memberships.map((membership) => membership.toJSON()),
      privileges: this.privileges.map((privilege) => privilege.toJSON()),
      attributes: this.attributes.map((attribute) => ({ ...attribute }))
    };
  }
}
