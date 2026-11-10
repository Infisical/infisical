import { IdentityAttribute, TIdentityAttributeProps } from "./identity-attribute";
import { Membership, TMembershipProps } from "./membership";
import { Privilege, TPrivilegeProps } from "./privilege";

export type TActorGrantsProps = {
  memberships: TMembershipProps[];
  privileges: TPrivilegeProps[];
  attributes: TIdentityAttributeProps[];
};

// A role or privilege as a permission source: the slug, and the packed rules a custom role or privilege carries.
export type TGrantEntry = { role: string; permissions?: unknown };

// What one user or identity holds at one scope: its memberships there (direct and through groups) with their
// roles, its privileges at that scope, and its attributes. Plain data: building an ability from it is the scope
// owner's job, with the roles the owner defines.
export class ActorGrants {
  readonly memberships: Membership[];

  readonly privileges: Privilege[];

  readonly attributes: IdentityAttribute[];

  private constructor(props: TActorGrantsProps) {
    this.memberships = props.memberships.map((membership) => Membership.restore(membership));
    this.privileges = props.privileges.map((privilege) => Privilege.restore(privilege));
    this.attributes = props.attributes.map((attribute) => IdentityAttribute.restore(attribute));
  }

  static restore(props: TActorGrantsProps): ActorGrants {
    return new ActorGrants(props);
  }

  static empty(): ActorGrants {
    return new ActorGrants({ memberships: [], privileges: [], attributes: [] });
  }

  get hasMembership(): boolean {
    return this.memberships.length > 0;
  }

  // Every active role, then every active privilege as the given custom slug, in the order the legacy engine
  // flattened them (roles before privileges, per membership).
  activeEntries(customRoleSlug: string, now: Date = new Date()): TGrantEntry[] {
    const roles = this.memberships.flatMap((membership) =>
      membership.activeRoles(now).map((role) => ({ role: role.role, permissions: role.customRolePermissions }))
    );
    const privileges = this.privileges
      .filter((privilege) => privilege.isActive(now))
      .map((privilege) => ({ role: customRoleSlug, permissions: privilege.permissions }));
    return roles.concat(privileges);
  }

  // Whether an active role carries this slug: a custom role's own slug, or a built-in slug.
  hasActiveRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) =>
      membership.activeRoles(now).some((role) => role.effectiveSlug === slug)
    );
  }

  // Whether an active role is this built-in slug. A custom role slugged the same never matches.
  hasActiveBuiltInRole(slug: string, now: Date = new Date()): boolean {
    return this.memberships.some((membership) =>
      membership.activeRoles(now).some((role) => role.role === slug && !role.customRoleId)
    );
  }

  attributeMap(): Record<string, string> {
    return Object.fromEntries(this.attributes.map((attribute) => [attribute.key, attribute.value]));
  }

  toJSON(): TActorGrantsProps {
    return {
      memberships: this.memberships.map((membership) => membership.toJSON()),
      privileges: this.privileges.map((privilege) => privilege.toJSON()),
      attributes: this.attributes.map((attribute) => attribute.toJSON())
    };
  }
}
