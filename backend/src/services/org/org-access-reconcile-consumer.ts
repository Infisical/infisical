import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
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
  TOrgMembershipActor,
  TOrgMembershipEventPayload
} from "./org-membership-events";

export const ORG_ACCESS_RECONCILE_CONSUMER = "org-access-reconcile";
export const ACTORS_PER_RECONCILE_TX = 10;
const RECONCILE_STATEMENT_TIMEOUT_MS = 30_000;

export type TOrgAccessReconcileConsumerDep = {
  orgDAL: Pick<
    TOrgDALFactory,
    "findById" | "find" | "findActorsWithOrgAccess" | "lockActorsForOrgAccess" | "transaction"
  >;
  projectAccessRevokeService: Pick<TProjectAccessRevokeServiceFactory, "revokeActorsInOrgs">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
};

type TReconcileScope = { orgIds: string[]; actors: TOrgMembershipActor[]; groupId?: string };

const splitActors = (actors: TOrgMembershipActor[]) => ({
  userIds: actors.filter((a) => a.actorType === ActorType.USER).map((a) => a.actorId),
  identityIds: actors.filter((a) => a.actorType === ActorType.IDENTITY).map((a) => a.actorId)
});

// Keeps project memberships in an org only for actors that still reach it (direct org row or a group
// holding one). Events say what got removed; we figure out who might've lost their last path, recheck
// against current state and delete what's orphaned. Not on the enforcement path (token validation
// already rejects these actors) and safe to re-run.
export const orgAccessReconcileConsumerFactory = ({
  orgDAL,
  projectAccessRevokeService,
  auditLogService,
  usageMeteringService
}: TOrgAccessReconcileConsumerDep): IEventConsumer<TOrgMembershipEventPayload> => {
  const eventTypes = new Set<string>(ORG_MEMBERSHIP_EVENTS);
  const subscribesTo = (eventType: string) => eventTypes.has(eventType);

  // Group events carry the orgs and actors captured at removal time, since later removals can wipe the
  // rows that would tell us. Parsing is eager and reads are deferred: a bad payload never recovers, a
  // failed read is worth a retry.
  const $parseScope = (event: TEvent): (() => Promise<TReconcileScope>) => {
    switch (event.eventType) {
      case GROUP_MEMBERSHIP_REMOVED_EVENT: {
        const { groupId, orgIds, members } = GroupMembershipRemovedPayloadSchema.parse(event.payload);
        return async () => ({ orgIds, actors: members, groupId });
      }
      case GROUP_LINK_REMOVED_EVENT: {
        const { orgId, groupId, members } = GroupLinkRemovedPayloadSchema.parse(event.payload);
        return async () => ({ orgIds: [orgId], actors: members, groupId });
      }
      case GROUP_REMOVED_EVENT: {
        const { groupId, orgIds, members } = GroupRemovedPayloadSchema.parse(event.payload);
        return async () => ({ orgIds, actors: members, groupId });
      }
      case ORG_MEMBERSHIP_REMOVED_EVENT: {
        const { orgId, ...actor } = OrgMembershipRemovedPayloadSchema.parse(event.payload);
        return async () => {
          const childOrgs = await orgDAL.find({ rootOrgId: orgId });
          return { orgIds: [orgId, ...childOrgs.map((org) => org.id)], actors: [actor] };
        };
      }
      default:
        throw new Error(`No org membership event named '${event.eventType}'`);
    }
  };

  const $revokeActors = async (orgId: string, candidates: { userIds: string[]; identityIds: string[] }) =>
    orgDAL.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${RECONCILE_STATEMENT_TIMEOUT_MS}`);
      await orgDAL.lockActorsForOrgAccess([...candidates.userIds, ...candidates.identityIds], tx);

      const withAccess = await orgDAL.findActorsWithOrgAccess({ orgId, ...candidates }, tx);
      const userIds = candidates.userIds.filter((id) => !withAccess.userIds.has(id));
      const identityIds = candidates.identityIds.filter((id) => !withAccess.identityIds.has(id));
      if (!userIds.length && !identityIds.length) return null;

      return projectAccessRevokeService.revokeActorsInOrgs({ orgIds: [orgId], userIds, identityIds }, tx);
    });

  // Actors are handled in small batches, each in its own short tx, since the rows they hold aren't bounded.
  // Side effects fire per batch after commit and only when rows were removed, so replays are no-ops.
  const $reconcileOrg = async (orgId: string, scope: TReconcileScope, reason: string) => {
    const org = await orgDAL.findById(orgId);
    if (!org) return;

    for await (const actors of chunkArray(scope.actors, ACTORS_PER_RECONCILE_TX)) {
      const outcome = await $revokeActors(orgId, splitActors(actors));
      if (outcome) outcome.sendPamCancellations();
      if (outcome?.revoked.length) {
        for await (const { projectIds, resources, ...actor } of outcome.revoked) {
          await auditLogService.createAuditLog({
            orgId,
            actor: { type: ActorType.PLATFORM, metadata: {} },
            event: {
              type: EventType.REVOKE_ORG_PROJECT_ACCESS,
              metadata: { ...actor, projectIds, resources, reason, groupId: scope.groupId }
            }
          });
        }

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
