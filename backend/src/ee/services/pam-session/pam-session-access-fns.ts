import { Knex } from "knex";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamSessionStatus } from "../pam/pam-enums";
import { getResourceIdsWithActionsForActors, pamActorKey } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { ResourcePermissionPamResourceActions } from "../permission/resource-permission";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { terminatePamSessions } from "./pam-session-fns";

// Users and machine identities can both hold PAM sessions, and the two are tracked in separate columns
// (`userId` / `identityId` on the session, `actorUserId` / `actorIdentityId` on the membership). Carrying
// the kind alongside the id is what keeps a lookup from silently crossing the two.
export type TPamSessionActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

// Exactly one actor column is set per session row.
export const resolveSessionActor = (session: {
  userId?: string | null;
  identityId?: string | null;
}): TPamSessionActor | null => {
  if (session.identityId) return { type: ActorType.IDENTITY, id: session.identityId };
  if (session.userId) return { type: ActorType.USER, id: session.userId };
  return null;
};

type TLaunchableResources = { folderIds: Set<string>; accountIds: Set<string> };

// Mirrors checkAccountAccess's union: the account's folder carries the action, or a direct membership on
// the account does. With no resolved memberships at all there is no access.
export const hasLaunchAccessToAccount = (
  launchable: TLaunchableResources | undefined,
  account: { id: string; folderId?: string | null }
) => {
  if (!launchable) return false;
  if (account.folderId && launchable.folderIds.has(account.folderId)) return true;
  return launchable.accountIds.has(account.id);
};

type TTerminatePamSessionsWithoutLaunchAccessDTO = {
  projectId: string;
  // The actors whose access just changed, users and machine identities alike.
  actors: TPamSessionActor[];
  // The admin who made the access change; named as the terminating actor on the gateway signal.
  actorId: string;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActors">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "find">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "update">;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  tx: Knex;
};

/**
 * Closes the sessions an access change just invalidated, and returns the callback that cuts their tunnels.
 *
 * Losing a membership (or being demoted out of a role that carries LaunchSessions) does nothing on its own
 * to a session that is already running: neither the gateway nor the web-access loop re-checks permissions
 * mid-session, so a revoked Connector would keep their privileged tunnel until it expired. This re-derives
 * LaunchSessions for every live session the given actors hold in the project and terminates the ones that
 * no longer pass. Machine identities count: they can launch CLI sessions, so they lose them the same way.
 *
 * Re-deriving beats diffing the membership row that changed: the same launch access can also come from the
 * account's folder, a second direct membership, or a group, so removing one row does not necessarily end
 * access.
 *
 * Runs inside the caller's membership transaction and reads through `tx` throughout. That is what makes it
 * correct rather than racy — the check has to see the caller's own uncommitted revocation, which a replica
 * read would miss, and rolling back the membership change has to roll back the terminations with it. Only
 * the tunnel-cancellation signals are deferred, since those cannot be undone; the caller fires the returned
 * callback after COMMIT.
 *
 * Sharing that transaction is only affordable because the queries here are a fixed handful however many
 * actors and sessions are involved. Keep it that way: a per-actor lookup would pin the connection for
 * hundreds of round trips on a large group.
 */
export const terminatePamSessionsWithoutLaunchAccess = async ({
  projectId,
  actors,
  actorId,
  membershipDAL,
  membershipRoleDAL,
  pamAccountDAL,
  pamSessionDAL,
  userDAL,
  gatewayV2Service,
  tx
}: TTerminatePamSessionsWithoutLaunchAccessDTO): Promise<() => void> => {
  const noop = () => {};
  if (actors.length === 0) return noop;

  const userIds = actors.filter((actor) => actor.type === ActorType.USER).map((actor) => actor.id);
  const identityIds = actors.filter((actor) => actor.type === ActorType.IDENTITY).map((actor) => actor.id);
  const liveStatuses = [PamSessionStatus.Active, PamSessionStatus.Starting];

  // Two queries rather than one: the actor columns are mutually exclusive, and ormify's `$in` entries are
  // ANDed together, so a single filter on both columns would match nothing.
  const userSessions = userIds.length
    ? await pamSessionDAL.find({ projectId, $in: { userId: userIds, status: liveStatuses } }, { tx })
    : [];
  const identitySessions = identityIds.length
    ? await pamSessionDAL.find({ projectId, $in: { identityId: identityIds, status: liveStatuses } }, { tx })
    : [];

  // A session whose account was deleted keeps its history with a null accountId and has no access left to
  // re-check; the account delete path terminated it already.
  const sessions = [...userSessions, ...identitySessions].flatMap((session) => {
    const sessionActor = resolveSessionActor(session);
    if (!session.accountId || !sessionActor) return [];
    return [{ ...session, accountId: session.accountId, sessionActor }];
  });
  if (sessions.length === 0) return noop;

  const accounts = await pamAccountDAL.find(
    {
      projectId,
      $in: { id: [...new Set(sessions.map((session) => session.accountId))] }
    },
    { tx }
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  // Resolved per actor rather than per session, since an actor's grants cover every account.
  const launchableByActor = await getResourceIdsWithActionsForActors(
    membershipDAL,
    membershipRoleDAL,
    projectId,
    { allOf: [ResourcePermissionPamResourceActions.LaunchSessions] },
    [...new Map(sessions.map((s) => [pamActorKey(s.sessionActor), s.sessionActor])).values()],
    tx
  );

  const revoked = sessions.filter((session) => {
    const account = accountById.get(session.accountId);
    // The account is gone from under the session; its own delete path owns closing it.
    if (!account) return false;
    return !hasLaunchAccessToAccount(launchableByActor.get(pamActorKey(session.sessionActor)), account);
  });
  if (revoked.length === 0) return noop;

  const actor = await userDAL.findById(actorId, tx);
  return terminatePamSessions({
    sessions: revoked,
    actorId,
    actorEmail: actor?.email ?? "",
    pamSessionDAL,
    gatewayV2Service,
    tx
  });
};
