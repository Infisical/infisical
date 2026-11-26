import { ActorType } from "@app/lib/auth/actor-types";

import { ActorGrants, TIdentityAttributeRecord } from "./actor-grants";
import { Membership, TMembershipRecord } from "./membership";
import { TPrivilegeRecord } from "./privilege";

// Carries the owner since project-wide reads cover many actors.
export type TOwnedAttributeRecord = TIdentityAttributeRecord & { userId?: string | null; identityId?: string | null };

export type TProjectMemberGrantsRecord = {
  memberships: TMembershipRecord[];
  // Project-wide only, never folder grants.
  privileges: TPrivilegeRecord[];
  attributes: TOwnedAttributeRecord[];
};

type TMemberActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// Every member's grants in one project, read at once for member listings.
export class ProjectMemberGrants {
  private constructor(
    private readonly record: TProjectMemberGrantsRecord,
    readonly memberships: Membership[]
  ) {}

  static restore(record: TProjectMemberGrantsRecord): ProjectMemberGrants {
    return new ProjectMemberGrants(
      record,
      record.memberships.map((membership) => Membership.restore(membership))
    );
  }

  directMembers(): { actor: TMemberActor; membership: Membership }[] {
    return this.memberships.flatMap((membership) => {
      const { actor } = membership;
      return actor.type === "group" ? [] : [{ actor, membership }];
    });
  }

  groupMembers(): { groupId: string; membership: Membership }[] {
    return this.memberships.flatMap((membership) => {
      const { actor } = membership;
      return actor.type === "group" ? [{ groupId: actor.id, membership }] : [];
    });
  }

  // includeDirect: false keeps only the group memberships and drops the actor's own privileges too.
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
    const memberships = this.memberships
      .filter((membership) => (membership.viaGroupId || includeDirect) && membership.isFor({ actor, groupIds: groups }))
      .map((membership) => membership.toJSON());
    const owns = (row: { actorUserId?: string | null; actorIdentityId?: string | null }) =>
      actor.type === ActorType.USER ? row.actorUserId === actor.id : row.actorIdentityId === actor.id;
    const ownsAttribute = (row: TOwnedAttributeRecord) =>
      actor.type === ActorType.USER ? row.userId === actor.id : row.identityId === actor.id;
    return ActorGrants.restore({
      memberships,
      privileges: includeDirect ? this.record.privileges.filter(owns) : [],
      attributes: this.record.attributes.filter(ownsAttribute).map(({ id, key, value }) => ({ id, key, value }))
    });
  }

  toJSON(): TProjectMemberGrantsRecord {
    return structuredClone(this.record);
  }
}
