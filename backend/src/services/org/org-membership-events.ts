import { Knex } from "knex";
import { z } from "zod";

import { chunkArray } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TEventEmitter, TEventInput } from "@app/services/event-outbox/event-outbox-types";

export const GROUP_MEMBERSHIP_REMOVED_EVENT = "com.infisical.organization.group-membership.removed.v1";
export const GROUP_LINK_REMOVED_EVENT = "com.infisical.organization.group-link.removed.v1";
export const GROUP_REMOVED_EVENT = "com.infisical.organization.group.removed.v1";
export const ORG_MEMBERSHIP_REMOVED_EVENT = "com.infisical.organization.membership.removed.v1";

export const ORG_MEMBERSHIP_EVENTS = [
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_LINK_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  ORG_MEMBERSHIP_REMOVED_EVENT
] as const;

// keeps one event well under MAX_OUTBOX_PAYLOAD_BYTES
const MEMBERS_PER_EVENT = 100;

const ActorSchema = z.object({
  actorType: z.enum([ActorType.USER, ActorType.IDENTITY]),
  actorId: z.string().uuid()
});
export type TOrgMembershipActor = z.infer<typeof ActorSchema>;

export const GroupMembershipRemovedPayloadSchema = ActorSchema.extend({ groupId: z.string().uuid() });
export const GroupLinkRemovedPayloadSchema = z.object({ orgId: z.string().uuid(), groupId: z.string().uuid() });
// The cascade removes the group's members and links before the consumer runs, so the event carries them.
export const GroupRemovedPayloadSchema = z.object({
  orgId: z.string().uuid(),
  groupId: z.string().uuid(),
  linkedOrgIds: z.array(z.string().uuid()),
  members: z.array(ActorSchema).max(MEMBERS_PER_EVENT)
});
export const OrgMembershipRemovedPayloadSchema = ActorSchema.extend({ orgId: z.string().uuid() });

export const OrgMembershipEventPayloadSchema = z.union([
  GroupMembershipRemovedPayloadSchema,
  GroupRemovedPayloadSchema,
  GroupLinkRemovedPayloadSchema,
  OrgMembershipRemovedPayloadSchema
]);
export type TOrgMembershipEventPayload = z.infer<typeof OrgMembershipEventPayloadSchema>;

export const toOrgMembershipActors = ({
  userIds = [],
  identityIds = []
}: {
  userIds?: string[];
  identityIds?: string[];
}): TOrgMembershipActor[] => [
  ...[...new Set(userIds)].map((actorId) => ({ actorType: ActorType.USER as const, actorId })),
  ...[...new Set(identityIds)].map((actorId) => ({ actorType: ActorType.IDENTITY as const, actorId }))
];

const emitAll = async (eventEmitter: TEventEmitter, events: TEventInput[], tx?: Knex) => {
  for await (const event of events) {
    await eventEmitter.emit(event, tx);
  }
};

export const emitGroupMembershipRemoved = (
  eventEmitter: TEventEmitter,
  { groupId, actors }: { groupId: string; actors: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    actors.map((actor) => ({ eventType: GROUP_MEMBERSHIP_REMOVED_EVENT, payload: { groupId, ...actor } })),
    tx
  );

export const emitGroupLinkRemoved = (
  eventEmitter: TEventEmitter,
  { orgId, groupId }: { orgId: string; groupId: string },
  tx?: Knex
) => eventEmitter.emit({ eventType: GROUP_LINK_REMOVED_EVENT, payload: { orgId, groupId } }, tx);

// One group removal is one fact, but a big member list is paged across events so each fits the outbox.
export const emitGroupRemoved = (
  eventEmitter: TEventEmitter,
  {
    orgId,
    groupId,
    linkedOrgIds,
    members
  }: { orgId: string; groupId: string; linkedOrgIds: string[]; members: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    (members.length ? chunkArray(members, MEMBERS_PER_EVENT) : [[]]).map((page) => ({
      eventType: GROUP_REMOVED_EVENT,
      payload: { orgId, groupId, linkedOrgIds: [...new Set(linkedOrgIds)], members: page }
    })),
    tx
  );

export const emitOrgMembershipRemoved = (
  eventEmitter: TEventEmitter,
  { orgId, actors }: { orgId: string; actors: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    actors.map((actor) => ({ eventType: ORG_MEMBERSHIP_REMOVED_EVENT, payload: { orgId, ...actor } })),
    tx
  );
