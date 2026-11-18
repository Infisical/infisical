import {
  AccessScope,
  RESOURCE_SCOPE,
  TAdditionalPrivileges,
  TGroups,
  TIdentityMetadata,
  TMembershipRoles,
  TMemberships,
  TRoles
} from "@app/db/schemas";

export type TSeedActor = { userId: string } | { identityId: string };

export type TSeedRole = {
  role: string;
  customRoleId?: string;
  temporaryAccessEndTime?: Date;
};

export type TSeededMembership = TMemberships & { roles: TMembershipRoles[] };

// Writes the rows the grant store reads. The store has no writes, so each backend seeds its own way.
export type TGrantSeeder = {
  role(input: {
    owner: { orgId: string } | { projectId: string };
    slug: string;
    permissions?: unknown;
  }): Promise<TRoles>;
  // Roles default to a single built-in "member"; pass [] for a membership with no role assignment.
  membership(input: {
    scope: AccessScope | typeof RESOURCE_SCOPE;
    orgId: string;
    projectId?: string;
    resourceType?: string;
    resourceId?: string;
    actor: TSeedActor | { groupId: string };
    isActive?: boolean;
    roles?: TSeedRole[];
  }): Promise<TSeededMembership>;
  // A project or org privilege, or a folder grant when `folder` is given.
  privilege(input: {
    actor: TSeedActor;
    orgId?: string;
    projectId?: string;
    permissions?: unknown;
    folder?: { id: string; role: string };
  }): Promise<TAdditionalPrivileges>;
  group(input: { orgId: string }): Promise<TGroups>;
  groupMember(input: { groupId: string } & TSeedActor): Promise<void>;
  attribute(input: { orgId: string; actor: TSeedActor; key: string; value: string }): Promise<TIdentityMetadata>;
  removeMembership(membershipId: string): Promise<void>;
  deactivateMembership(membershipId: string): Promise<void>;
  // Moves a temporary role's end into the past, so a test never waits for the clock.
  endRoleAssignment(membershipRoleId: string): Promise<void>;
};

export const PAST = () => new Date(Date.now() - 60_000);

export const temporaryColumns = (endsAt?: Date) =>
  endsAt
    ? {
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1h",
        temporaryAccessStartTime: new Date(0),
        temporaryAccessEndTime: endsAt
      }
    : { isTemporary: false };
