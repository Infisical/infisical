import { TMemberships } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";

import { RoleAssignment, TRoleAssignmentRecord } from "./role-assignment";

export type TMembershipRecord = TMemberships & { roles: TRoleAssignmentRecord[] };

export type TMembershipActor =
  | { type: ActorType.USER; id: string }
  | { type: ActorType.IDENTITY; id: string }
  | { type: "group"; id: string };

const asDate = <T extends Date | string | null | undefined>(value: T) =>
  (value ? new Date(value) : value) as T extends string ? Date : T;

// An actor's place in an org, a project or a resource, with the roles it holds there. A user or identity is a
// member directly; a group's membership applies to every member of the group.
export class Membership {
  private constructor(
    private readonly record: Omit<TMembershipRecord, "roles">,
    private readonly roleAssignments: RoleAssignment[]
  ) {}

  // Trusts the row. Dates may arrive as strings from a cache.
  static restore({ roles, ...record }: TMembershipRecord): Membership {
    return new Membership(
      {
        ...record,
        createdAt: asDate(record.createdAt),
        updatedAt: asDate(record.updatedAt),
        lastInvitedAt: asDate(record.lastInvitedAt),
        lastLoginTime: asDate(record.lastLoginTime)
      },
      roles.map((role) => RoleAssignment.restore(role))
    );
  }

  get id(): string {
    return this.record.id;
  }

  get isActive(): boolean {
    return Boolean(this.record.isActive);
  }

  get resourceId(): string | null {
    return this.record.scopeResourceId ?? null;
  }

  get resourceType(): string | null {
    return this.record.scopeResourceType ?? null;
  }

  get actor(): TMembershipActor {
    if (this.record.actorUserId) return { type: ActorType.USER, id: this.record.actorUserId };
    if (this.record.actorIdentityId) return { type: ActorType.IDENTITY, id: this.record.actorIdentityId };
    return { type: "group", id: this.record.actorGroupId as string };
  }

  get viaGroupId(): string | null {
    return this.record.actorGroupId ?? null;
  }

  get roles(): RoleAssignment[] {
    return this.roleAssignments;
  }

  activeRoles(now: Date = new Date()): RoleAssignment[] {
    return this.roleAssignments.filter((role) => role.isActive(now));
  }

  // Whether this membership is the given user's or identity's own, or through one of the given groups.
  isFor({ actor, groupIds }: { actor: { type: ActorType; id: string }; groupIds: Set<string> }): boolean {
    if (this.record.actorGroupId) return groupIds.has(this.record.actorGroupId);
    return actor.type === ActorType.USER
      ? this.record.actorUserId === actor.id
      : this.record.actorIdentityId === actor.id;
  }

  toJSON(): TMembershipRecord {
    return { ...this.record, roles: this.roleAssignments.map((role) => role.toJSON()) };
  }
}
