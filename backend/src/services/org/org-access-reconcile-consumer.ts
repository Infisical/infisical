import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import {
  EventResultStatus,
  IEventConsumer,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";
import { AgentVaultIdentities, PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TProjectAccessRevokeServiceFactory } from "@app/services/membership/project-access-revoke-service";

import { auditRevokedProjectAccess } from "./org-access-fns";
import { TOrgDALFactory } from "./org-dal";
import {
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  GroupLinkRemovedPayloadSchema,
  GroupMembershipRemovedPayloadSchema,
  GroupRemovedPayloadSchema,
  ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT,
  ORG_MEMBERSHIP_EVENTS,
  ORG_MEMBERSHIP_REMOVED_EVENT,
  OrgAccessRemovalCause,
  OrgMembershipEventPayloadSchema,
  OrgMembershipRemovedPayloadSchema,
  TOrgMembershipActor,
  TOrgMembershipEventPayload
} from "./org-membership-events";

export const ORG_ACCESS_RECONCILE_CONSUMER = "org-access-reconcile";
export const ACTORS_PER_RECONCILE_TX = 10;
const RECONCILE_STATEMENT_TIMEOUT_MS = 30_000;

type TOrgAccessReconcileConsumerDep = {
  orgDAL: Pick<
    TOrgDALFactory,
    "findById" | "find" | "findActorsWithOrgAccess" | "lockActorsForOrgAccess" | "transaction" | "primaryNode"
  >;
  projectAccessRevokeService: Pick<TProjectAccessRevokeServiceFactory, "revokeActorsInOrgs">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
};

type TReconcileScope = {
  orgIds: string[];
  actors: TOrgMembershipActor[];
  reason: OrgAccessRemovalCause;
  groupId?: string;
};

const splitActors = (actors: TOrgMembershipActor[]) => ({
  userIds: actors.filter((a) => a.actorType === ActorType.USER).map((a) => a.actorId),
  identityIds: actors.filter((a) => a.actorType === ActorType.IDENTITY).map((a) => a.actorId)
});

// Keeps project memberships in an org only for actors that still reach it. Events say what got removed; we
// recheck who might've lost their last path and delete what's orphaned. Not on the enforcement path (token
// validation already rejects these actors) and safe to re-run.
export const orgAccessReconcileConsumerFactory = ({
  orgDAL,
  projectAccessRevokeService,
  auditLogService,
  usageMeteringService
}: TOrgAccessReconcileConsumerDep): IEventConsumer<TOrgMembershipEventPayload> => {
  const eventTypes = new Set<string>(ORG_MEMBERSHIP_EVENTS);
  const subscribesTo = (eventType: string) => eventTypes.has(eventType);

  // Group events carry orgs and actors captured at removal time, since later removals can wipe those rows.
  // Parse eagerly and read lazily: a bad payload never recovers, a failed read is worth a retry.
  const $parseScope = (event: TEvent): (() => Promise<TReconcileScope>) => {
    switch (event.eventType) {
      case GROUP_MEMBERSHIP_REMOVED_EVENT: {
        const { groupId, orgIds, members } = GroupMembershipRemovedPayloadSchema.parse(event.payload);
        const reason = ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT[event.eventType];
        return async () => ({ orgIds, actors: members, reason, groupId });
      }
      case GROUP_LINK_REMOVED_EVENT: {
        const { orgId, groupId, members } = GroupLinkRemovedPayloadSchema.parse(event.payload);
        const reason = ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT[event.eventType];
        return async () => ({ orgIds: [orgId], actors: members, reason, groupId });
      }
      case GROUP_REMOVED_EVENT: {
        const { groupId, orgIds, members } = GroupRemovedPayloadSchema.parse(event.payload);
        const reason = ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT[event.eventType];
        return async () => ({ orgIds, actors: members, reason, groupId });
      }
      case ORG_MEMBERSHIP_REMOVED_EVENT: {
        const { orgId, ...actor } = OrgMembershipRemovedPayloadSchema.parse(event.payload);
        const reason = ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT[event.eventType];
        return async () => {
          const childOrgs = await orgDAL.find({ rootOrgId: orgId }, { tx: orgDAL.primaryNode() });
          return { orgIds: [orgId, ...childOrgs.map((org) => org.id)], actors: [actor], reason };
        };
      }
      default:
        throw new Error(`No org membership event named '${event.eventType}'`);
    }
  };

  const $revokeActors = async (orgId: string, candidates: { userIds: string[]; identityIds: string[] }) =>
    orgDAL.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${RECONCILE_STATEMENT_TIMEOUT_MS}`);
      await orgDAL.lockActorsForOrgAccess({ orgId, actorIds: [...candidates.userIds, ...candidates.identityIds] }, tx);

      const withAccess = await orgDAL.findActorsWithOrgAccess({ orgId, ...candidates }, tx);
      const userIds = candidates.userIds.filter((id) => !withAccess.userIds.has(id));
      const identityIds = candidates.identityIds.filter((id) => !withAccess.identityIds.has(id));
      if (!userIds.length && !identityIds.length) return null;

      return projectAccessRevokeService.revokeActorsInOrgs({ orgIds: [orgId], userIds, identityIds }, tx);
    });

  // Small actor batches, each in its own short tx, since what they hold isn't bounded. Side effects fire per
  // batch after commit and only when rows went, so replays are no-ops. The org and sub-org reads go to the
  // primary: a row the replica hasn't seen yet would otherwise mark the event delivered with nothing done.
  const $reconcileOrg = async (orgId: string, scope: TReconcileScope) => {
    const org = await orgDAL.findById(orgId, orgDAL.primaryNode());
    if (!org) return;

    for await (const actors of chunkArray(scope.actors, ACTORS_PER_RECONCILE_TX)) {
      const outcome = await $revokeActors(orgId, splitActors(actors));
      if (outcome) outcome.sendPamCancellations();
      if (outcome?.revoked.length) {
        await auditRevokedProjectAccess({
          auditLogService,
          revoked: outcome.revoked,
          reason: scope.reason,
          groupId: scope.groupId
        });

        usageMeteringService.emit(orgId, SecretIdentities.key);
        usageMeteringService.emit(orgId, PamIdentities.key);
        usageMeteringService.emit(orgId, AgentVaultIdentities.key);
      }
    }
  };

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const id = String(event.id);
    let resolveScope: () => Promise<TReconcileScope>;
    try {
      resolveScope = $parseScope(event);
    } catch (error) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `Unreadable org membership event: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }

    let scope: TReconcileScope;
    try {
      scope = await resolveScope();
    } catch (error) {
      logger.error(error, `org-access-reconcile: failed to resolve the orgs and actors to recheck [eventId=${id}]`);
      return {
        id,
        status: EventResultStatus.Retry,
        error: `Could not resolve the orgs and actors to recheck: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }

    const errors: string[] = [];
    for await (const orgId of scope.orgIds) {
      try {
        await $reconcileOrg(orgId, scope);
      } catch (error) {
        logger.error(error, `org-access-reconcile: failed [orgId=${orgId}] [eventId=${id}]`);
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
