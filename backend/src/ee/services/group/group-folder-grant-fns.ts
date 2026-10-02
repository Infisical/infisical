import { Knex } from "knex";

import { AccessScope } from "@app/db/schemas";
import { chunkArray } from "@app/lib/fn";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";

import { TIdentityGroupMembershipDALFactory } from "./identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

const ACTOR_CHUNK_SIZE = 50;

type TReapOrphanedFolderGrantsDeps = {
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "filterProjectsByUserMembership">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "filterProjectsByIdentityMembership">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
};

type TReapOrphanedFolderGrantsArg = {
  groupId: string;
  projectIdsByUserId: Map<string, string[]>;
  projectIdsByIdentityId: Map<string, string[]>;
};

type TProjectMembershipActor = {
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  scopeProjectId?: string | null;
};

const $appendProjectId = (byActorId: Map<string, string[]>, actorId: string, projectId: string) => {
  byActorId.set(actorId, [...(byActorId.get(actorId) ?? []), projectId]);
};

export const collectProjectIdsByActor = (
  memberships: TProjectMembershipActor[],
  maps: {
    projectIdsByUserId?: Map<string, string[]>;
    projectIdsByIdentityId?: Map<string, string[]>;
  } = {}
) => {
  const projectIdsByUserId = maps.projectIdsByUserId ?? new Map<string, string[]>();
  const projectIdsByIdentityId = maps.projectIdsByIdentityId ?? new Map<string, string[]>();

  for (const membership of memberships) {
    if (membership.scopeProjectId) {
      if (membership.actorUserId) {
        $appendProjectId(projectIdsByUserId, membership.actorUserId, membership.scopeProjectId);
      } else if (membership.actorIdentityId) {
        $appendProjectId(projectIdsByIdentityId, membership.actorIdentityId, membership.scopeProjectId);
      }
    }
  }

  return { projectIdsByUserId, projectIdsByIdentityId };
};

const $collectOrphanedActorsByProject = (
  candidatesByActorId: Map<string, string[]>,
  stillReachable: Map<string, Set<string>>
) => {
  const actorsByProject = new Map<string, Set<string>>();

  for (const [actorId, candidates] of candidatesByActorId) {
    const reachable = stillReachable.get(actorId);
    for (const projectId of candidates) {
      if (!reachable?.has(projectId)) {
        const actors = actorsByProject.get(projectId);
        if (actors) {
          actors.add(actorId);
        } else {
          actorsByProject.set(projectId, new Set([actorId]));
        }
      }
    }
  }

  return actorsByProject;
};

/**
 * Deletes folder grants — and only folder grants, hence the `folderId` filter — for every
 * (actor, project) pair in the candidate maps that the actor no longer reaches, directly or through
 * another group. A grant is keyed on actor + project rather than on a membership, so nothing
 * cascades when a teardown removes an actor's last route into a project: the row survives and
 * reactivates if the actor is ever re-added.
 */
export const reapOrphanedFolderGrants = async (
  { userGroupMembershipDAL, identityGroupMembershipDAL, additionalPrivilegeDAL }: TReapOrphanedFolderGrantsDeps,
  { groupId, projectIdsByUserId, projectIdsByIdentityId }: TReapOrphanedFolderGrantsArg,
  tx: Knex
) => {
  const userIds = Array.from(projectIdsByUserId.keys());
  const userProjectIds = Array.from(new Set(Array.from(projectIdsByUserId.values()).flat()));

  if (userIds.length && userProjectIds.length) {
    const stillReachable = await userGroupMembershipDAL.filterProjectsByUserMembership(
      userIds,
      groupId,
      userProjectIds,
      tx
    );

    for (const [projectId, orphanedUserIds] of $collectOrphanedActorsByProject(projectIdsByUserId, stillReachable)) {
      for (const chunk of chunkArray(Array.from(orphanedUserIds), ACTOR_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await additionalPrivilegeDAL.delete({ projectId, $in: { actorUserId: chunk }, $notNull: ["folderId"] }, tx);
      }
    }
  }

  const identityIds = Array.from(projectIdsByIdentityId.keys());
  const identityProjectIds = Array.from(new Set(Array.from(projectIdsByIdentityId.values()).flat()));

  if (identityIds.length && identityProjectIds.length) {
    const stillReachable = await identityGroupMembershipDAL.filterProjectsByIdentityMembership(
      identityIds,
      groupId,
      identityProjectIds,
      tx
    );

    for (const [projectId, orphanedIdentityIds] of $collectOrphanedActorsByProject(
      projectIdsByIdentityId,
      stillReachable
    )) {
      for (const chunk of chunkArray(Array.from(orphanedIdentityIds), ACTOR_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await additionalPrivilegeDAL.delete({ projectId, $in: { actorIdentityId: chunk }, $notNull: ["folderId"] }, tx);
      }
    }
  }
};

type TReapDeletedGroupFolderGrantsDeps = Omit<
  TReapOrphanedFolderGrantsDeps,
  "userGroupMembershipDAL" | "identityGroupMembershipDAL"
> & {
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "filterProjectsByUserMembership" | "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "filterProjectsByIdentityMembership" | "find">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
};

/**
 * Reaps the folder grants of every member of [groupId] across the projects the group was on.
 * Deleting the group cascades its memberships away without touching the grants, so this has to run
 * while those memberships are still readable, i.e. before the group row is deleted.
 */
export const reapDeletedGroupFolderGrants = async (
  deps: TReapDeletedGroupFolderGrantsDeps,
  groupId: string,
  tx: Knex
) => {
  const [groupUsers, groupIdentities, groupProjectMemberships] = await Promise.all([
    deps.userGroupMembershipDAL.find({ groupId }, { tx }),
    deps.identityGroupMembershipDAL.find({ groupId }, { tx }),
    deps.membershipGroupDAL.find({ actorGroupId: groupId, scope: AccessScope.Project }, { tx })
  ]);

  const projectIds = Array.from(
    new Set(groupProjectMemberships.map((membership) => membership.scopeProjectId).filter(Boolean) as string[])
  );
  if (!projectIds.length) return;

  await reapOrphanedFolderGrants(
    deps,
    {
      groupId,
      projectIdsByUserId: new Map(groupUsers.map(({ userId }) => [userId, projectIds])),
      projectIdsByIdentityId: new Map(groupIdentities.map(({ identityId }) => [identityId, projectIds]))
    },
    tx
  );
};
