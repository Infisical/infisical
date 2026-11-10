import { AccessScope, RESOURCE_SCOPE, TMemberships } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";

import { RoleAssignment, TRoleAssignmentProps } from "./role-assignment";

export type TMembershipProps = TMemberships & { roles: TRoleAssignmentProps[] };

export type TMembershipActor =
  | { type: ActorType.USER; id: string }
  | { type: ActorType.IDENTITY; id: string }
  | { type: "group"; id: string };

export type TMembershipScope =
  | { scope: AccessScope.Organization; orgId: string }
  | { scope: AccessScope.Project; orgId: string; projectId: string }
  | { scope: typeof RESOURCE_SCOPE; orgId: string; projectId: string; resourceType: string; resourceId: string };

// An actor's place in an org, a project or a resource, with the roles it holds there. A user or identity is a
// member directly; a group's membership applies to every member of the group.
export class Membership {
  private readonly roleAssignments: RoleAssignment[];

  private constructor(private readonly props: TMembershipProps) {
    this.roleAssignments = props.roles.map((role) => RoleAssignment.restore(role));
  }

  static restore(props: TMembershipProps): Membership {
    const actorCount = [props.actorUserId, props.actorIdentityId, props.actorGroupId].filter(Boolean).length;
    if (actorCount !== 1) {
      throw new BadRequestError({ message: "A membership must belong to exactly one user, identity or group" });
    }
    if (props.scope === AccessScope.Project && !props.scopeProjectId) {
      throw new BadRequestError({ message: "A project membership must name its project" });
    }
    if (
      props.scope === RESOURCE_SCOPE &&
      (!props.scopeProjectId || !props.scopeResourceType || !props.scopeResourceId)
    ) {
      throw new BadRequestError({ message: "A resource membership must name its project, resource type and resource" });
    }
    return new Membership(props);
  }

  get id(): string {
    return this.props.id;
  }

  get scope(): string {
    return this.props.scope;
  }

  get orgId(): string {
    return this.props.scopeOrgId;
  }

  get projectId(): string | null {
    return this.props.scopeProjectId ?? null;
  }

  get resourceType(): string | null {
    return this.props.scopeResourceType ?? null;
  }

  get resourceId(): string | null {
    return this.props.scopeResourceId ?? null;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get actor(): TMembershipActor {
    if (this.props.actorUserId) return { type: ActorType.USER, id: this.props.actorUserId };
    if (this.props.actorIdentityId) return { type: ActorType.IDENTITY, id: this.props.actorIdentityId };
    return { type: "group", id: this.props.actorGroupId as string };
  }

  get viaGroupId(): string | null {
    return this.props.actorGroupId ?? null;
  }

  get roles(): RoleAssignment[] {
    return this.roleAssignments;
  }

  activeRoles(now: Date = new Date()): RoleAssignment[] {
    return this.roleAssignments.filter((role) => role.isActive(now));
  }

  // The legacy row shape callers of the permission engine read (`memberships` on a permission result).
  toJSON(): TMembershipProps {
    return { ...this.props, roles: this.roleAssignments.map((role) => role.toJSON()) };
  }
}
