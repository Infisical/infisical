import { ActorType } from "@app/lib/auth/actor-types";

import { ActorGrants } from "./actor-grants";
import { TIdentityAttributeProps } from "./identity-attribute";
import { Membership, TMembershipProps } from "./membership";
import { TPrivilegeProps } from "./privilege";

// An attribute with its owner, for project-wide reads that cover many actors.
export type TOwnedAttributeProps = TIdentityAttributeProps & { userId?: string | null; identityId?: string | null };

export type TProjectMemberGrantsProps = {
  memberships: TMembershipProps[];
  // The project-wide privileges of the project's users and identities (never folder grants).
  privileges: TPrivilegeProps[];
  attributes: TOwnedAttributeProps[];
};

type TMemberActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// Everyone's grants in one project: every user, identity and group membership there with its roles, and the
// project-wide privileges and attributes of the users and identities. For listings over all members.
export class ProjectMemberGrants {
  readonly memberships: Membership[];

  private constructor(private readonly props: TProjectMemberGrantsProps) {
    this.memberships = props.memberships.map((membership) => Membership.restore(membership));
  }

  static restore(props: TProjectMemberGrantsProps): ProjectMemberGrants {
    return new ProjectMemberGrants(props);
  }

  // Users and identities that are members directly, in membership order.
  directMembers(): { actor: TMemberActor; membership: Membership }[] {
    return this.memberships.flatMap((membership) => {
      const { actor } = membership;
      return actor.type === "group" ? [] : [{ actor, membership }];
    });
  }

  // Groups that are members, in membership order.
  groupMembers(): { groupId: string; membership: Membership }[] {
    return this.memberships.flatMap((membership) => {
      const { actor } = membership;
      return actor.type === "group" ? [{ groupId: actor.id, membership }] : [];
    });
  }

  // One user's or identity's grants: its direct membership (unless left out) and the memberships of the given
  // groups, with its own privileges and attributes.
  grantsFor({
    actor,
    groupIds = [],
    includeDirect = true
  }: {
    actor: TMemberActor;
    groupIds?: string[];
    includeDirect?: boolean;
  }): ActorGrants {
    const groups = new Set(groupIds);
    const memberships = this.props.memberships.filter((membership) => {
      if (membership.actorGroupId) return groups.has(membership.actorGroupId);
      if (!includeDirect) return false;
      return actor.type === ActorType.USER
        ? membership.actorUserId === actor.id
        : membership.actorIdentityId === actor.id;
    });
    const owns = (row: { actorUserId?: string | null; actorIdentityId?: string | null }) =>
      actor.type === ActorType.USER ? row.actorUserId === actor.id : row.actorIdentityId === actor.id;
    const ownsAttribute = (row: TOwnedAttributeProps) =>
      actor.type === ActorType.USER ? row.userId === actor.id : row.identityId === actor.id;
    return ActorGrants.restore({
      memberships,
      privileges: includeDirect ? this.props.privileges.filter(owns) : [],
      attributes: this.props.attributes.filter(ownsAttribute).map(({ id, key, value }) => ({ id, key, value }))
    });
  }

  toJSON(): TProjectMemberGrantsProps {
    return structuredClone(this.props);
  }
}
