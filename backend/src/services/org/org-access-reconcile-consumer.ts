import { AccessScope } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { terminatePamSessionsForUsers } from "@app/ee/services/pam-session/pam-session-access-fns";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ActorType } from "@app/services/auth/auth-type";
import {
  EventResultStatus,
  IEventConsumer,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";
import { AgentVaultIdentities, PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import {
  APPLICATION_APPROVAL_SCOPES,
  TApplicationMembershipCleanupServiceFactory
} from "@app/services/membership/application-membership-cleanup-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { ApplicationMemberKind } from "@app/services/pki-application/pki-application-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";

import { TOrgDALFactory } from "./org-dal";
import {
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  GroupLinkRemovedPayloadSchema,
  GroupMembershipRemovedPayloadSchema,
  GroupRemovedPayloadSchema,
  ORG_MEMBERSHIP_EVENTS,
  ORG_MEMBERSHIP_REMOVED_EVENT,
  OrgMembershipEventPayloadSchema,
  OrgMembershipRemovedPayloadSchema,
  toOrgMembershipActors,
  TOrgMembershipActor,
  TOrgMembershipEventPayload
} from "./org-membership-events";

export const ORG_ACCESS_RECONCILE_CONSUMER = "org-access-reconcile";

export type TOrgAccessReconcileConsumerDep = {
  orgDAL: Pick<TOrgDALFactory, "findById" | "find" | "findActorsWithOrgAccess" | "lockActorsForOrgAccess">;
  groupDAL: Pick<TGroupDALFactory, "findGroupActorsAndOrgs">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "delete" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "delete">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "delete">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteUserStepApproversInProjects">;
  applicationMembershipCleanupService: Pick<
    TApplicationMembershipCleanupServiceFactory,
    "cleanupActorApplicationMemberships" | "cleanupUsersApplicationMemberships"
  >;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "findLiveByOrgAndUserIds" | "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
};

type TRevokedActor = { userId?: string; identityId?: string; projectIds: string[] };
type TReconcileScope = { orgIds: string[]; actors: TOrgMembershipActor[]; groupId?: string };

const splitActors = (actors: TOrgMembershipActor[]) => ({
  userIds: actors.filter((a) => a.actorType === ActorType.USER).map((a) => a.actorId),
  identityIds: actors.filter((a) => a.actorType === ActorType.IDENTITY).map((a) => a.actorId)
});

// One invariant: an actor keeps project memberships in an org only while they have a direct org row
// there or a group that holds one. The org membership events say what was removed; this works out who
// may have lost their last path, recomputes from current state and deletes what is orphaned, one short
// transaction per org.
//
// Not on the enforcement path: token validation already rejects actors with no effective org
// membership, so these rows are inert until it runs. Safe to re-run, and an actor re-added in the
// meantime keeps everything.
export const orgAccessReconcileConsumerFactory = ({
  orgDAL,
  groupDAL,
  projectDAL,
  membershipDAL,
  membershipRoleDAL,
  additionalPrivilegeDAL,
  projectKeyDAL,
  approvalPolicyDAL,
  applicationMembershipCleanupService,
  alertChannelRecipientDAL,
  pamSessionDAL,
  gatewayV2Service,
  auditLogService,
  usageMeteringService
}: TOrgAccessReconcileConsumerDep): IEventConsumer<TOrgMembershipEventPayload> => {
  const eventTypes = new Set<string>(ORG_MEMBERSHIP_EVENTS);
  const subscribesTo = (eventType: string) => eventTypes.has(eventType);

  // Each event names what was removed; the orgs and actors to recheck follow from it. Only the group
  // removal carries them itself, because its cascade has already deleted what would be read here.
  const $resolveScope = async (event: TEvent): Promise<TReconcileScope> => {
    switch (event.eventType) {
      case GROUP_MEMBERSHIP_REMOVED_EVENT: {
        const { groupId, ...actor } = GroupMembershipRemovedPayloadSchema.parse(event.payload);
        const groupOrgRows = await membershipDAL.find({ scope: AccessScope.Organization, actorGroupId: groupId });
        return { orgIds: groupOrgRows.map((row) => row.scopeOrgId), actors: [actor], groupId };
      }
      case GROUP_LINK_REMOVED_EVENT: {
        const { orgId, groupId } = GroupLinkRemovedPayloadSchema.parse(event.payload);
        const { userIds, identityIds } = await groupDAL.findGroupActorsAndOrgs(groupId);
        return { orgIds: [orgId], actors: toOrgMembershipActors({ userIds, identityIds }), groupId };
      }
      case GROUP_REMOVED_EVENT: {
        const { orgId, groupId, linkedOrgIds, members } = GroupRemovedPayloadSchema.parse(event.payload);
        return { orgIds: [orgId, ...linkedOrgIds], actors: members, groupId };
      }
      case ORG_MEMBERSHIP_REMOVED_EVENT: {
        const { orgId, ...actor } = OrgMembershipRemovedPayloadSchema.parse(event.payload);
        const childOrgs = await orgDAL.find({ rootOrgId: orgId });
        return { orgIds: [orgId, ...childOrgs.map((org) => org.id)], actors: [actor] };
      }
      default:
        throw new Error(`No org membership event named '${event.eventType}'`);
    }
  };

  const $reconcileOrg = async (orgId: string, scope: TReconcileScope, reason: string) => {
    const org = await orgDAL.findById(orgId);
    if (!org) return;
    const candidates = splitActors(scope.actors);

    const outcome = await membershipDAL.transaction(async (tx) => {
      await orgDAL.lockActorsForOrgAccess([...candidates.userIds, ...candidates.identityIds], tx);

      const withAccess = await orgDAL.findActorsWithOrgAccess({ orgId, ...candidates }, tx);
      const userIds = candidates.userIds.filter((id) => !withAccess.userIds.has(id));
      const identityIds = candidates.identityIds.filter((id) => !withAccess.identityIds.has(id));
      if (!userIds.length && !identityIds.length) return null;

      const projectScope = { scope: AccessScope.Project, scopeOrgId: orgId };
      const userRows = userIds.length
        ? await membershipDAL.find({ ...projectScope, $in: { actorUserId: userIds } }, { tx })
        : [];
      const identityRows = identityIds.length
        ? await membershipDAL.find({ ...projectScope, $in: { actorIdentityId: identityIds } }, { tx })
        : [];

      const membershipIds = [...userRows, ...identityRows].map((row) => row.id);
      if (membershipIds.length) {
        await membershipRoleDAL.delete({ $in: { membershipId: membershipIds } }, tx);
        await membershipDAL.delete({ $in: { id: membershipIds } }, tx);
      }

      // keyed on actor + project, not on a membership, and may exist for projects reached only through a
      // group; reap across the whole org so nothing reactivates on re-add
      const orgProjectIds = (await projectDAL.find({ orgId }, { tx })).map((project) => project.id);
      if (orgProjectIds.length && userIds.length) {
        await additionalPrivilegeDAL.delete({ $in: { actorUserId: userIds, projectId: orgProjectIds } }, tx);
        await projectKeyDAL.delete({ $in: { receiverId: userIds, projectId: orgProjectIds } }, tx);
        await approvalPolicyDAL.deleteUserStepApproversInProjects(
          { projectIds: orgProjectIds, userIds, scopeTypes: APPLICATION_APPROVAL_SCOPES },
          tx
        );
      }
      if (orgProjectIds.length && identityIds.length) {
        await additionalPrivilegeDAL.delete({ $in: { actorIdentityId: identityIds, projectId: orgProjectIds } }, tx);
      }

      const userRowsByProject = groupBy(userRows, (row) => row.scopeProjectId as string);
      for await (const [projectId, rows] of Object.entries(userRowsByProject)) {
        await applicationMembershipCleanupService.cleanupUsersApplicationMemberships(
          { projectId, userIds: rows.map((row) => row.actorUserId as string) },
          tx
        );
      }
      for await (const row of identityRows) {
        await applicationMembershipCleanupService.cleanupActorApplicationMemberships(
          {
            projectId: row.scopeProjectId as string,
            actorKind: ApplicationMemberKind.Identity,
            actorId: row.actorIdentityId as string
          },
          tx
        );
      }

      if (userIds.length) {
        await alertChannelRecipientDAL.pruneOutOfScopeRecipients({ userIds }, tx);
      }

      const sendPamCancellations = await terminatePamSessionsForUsers({
        orgIds: [orgId],
        userIds,
        pamSessionDAL,
        gatewayV2Service,
        tx
      });

      const projectIdsOf = (rows: typeof userRows) => rows.map((row) => row.scopeProjectId as string);
      const revoked: TRevokedActor[] = [
        ...Object.entries(groupBy(userRows, (row) => row.actorUserId as string)).map(([userId, rows]) => ({
          userId,
          projectIds: projectIdsOf(rows)
        })),
        ...Object.entries(groupBy(identityRows, (row) => row.actorIdentityId as string)).map(([identityId, rows]) => ({
          identityId,
          projectIds: projectIdsOf(rows)
        }))
      ];
      return { revoked, sendPamCancellations };
    });

    if (!outcome) return;
    outcome.sendPamCancellations();

    // at-least-once delivery: a replay finds no rows and returns above, so these fire once
    if (!outcome.revoked.length) return;

    for await (const { projectIds, ...actor } of outcome.revoked) {
      await auditLogService.createAuditLog({
        orgId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.REVOKE_ORG_PROJECT_ACCESS,
          metadata: { ...actor, projectIds, reason, groupId: scope.groupId }
        }
      });
    }

    usageMeteringService.emit(orgId, SecretIdentities.key);
    usageMeteringService.emit(orgId, PamIdentities.key);
    usageMeteringService.emit(orgId, AgentVaultIdentities.key);
  };

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const id = String(event.id);
    let scope: TReconcileScope;
    try {
      scope = await $resolveScope(event);
    } catch (error) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `Unreadable org membership event: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }

    const errors: string[] = [];
    for await (const orgId of scope.orgIds) {
      try {
        await $reconcileOrg(orgId, scope, event.eventType);
      } catch (error) {
        logger.error(error, `org-access-reconcile: failed for org ${orgId} (event ${id})`);
        errors.push(`org ${orgId}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    if (errors.length) return { id, status: EventResultStatus.Retry, error: errors.join("; ") };
    return { id, status: EventResultStatus.Delivered };
  };

  const handle = async (events: TEvent[]): Promise<TEventConsumerResult[]> => {
    const results: TEventConsumerResult[] = [];
    for await (const event of events) {
      results.push(await $handleEvent(event));
    }
    return results;
  };

  return {
    name: ORG_ACCESS_RECONCILE_CONSUMER,
    payloadSchema: OrgMembershipEventPayloadSchema,
    subscribesTo,
    handle
  };
};
