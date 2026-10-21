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

// Together these keep one event well under MAX_OUTBOX_PAYLOAD_BYTES (about 4 KB of org ids, 6 KB of members);
// a group can be linked into any number of sub-orgs, so neither list may go unbounded.
const ORGS_PER_EVENT = 100;
const MEMBERS_PER_EVENT = 100;

const ActorSchema = z.object({
  actorType: z.enum([ActorType.USER, ActorType.IDENTITY]),
  actorId: z.string().uuid()
});
export type TOrgMembershipActor = z.infer<typeof ActorSchema>;

// Each group event carries the orgs and actors it affects, read when the removal happened: by the time the
// consumer runs, a later removal (or the group delete cascade) may have taken away the rows that would say.
// A group membership removal names the members who left; a group removal names all of them. Both list every
// org the group held a row in, the group's own org included.
const GroupScopePayloadSchema = z.object({
  groupId: z.string().uuid(),
  orgIds: z.array(z.string().uuid()).max(ORGS_PER_EVENT),
  members: z.array(ActorSchema).max(MEMBERS_PER_EVENT)
});
export const GroupMembershipRemovedPayloadSchema = GroupScopePayloadSchema;
export const GroupRemovedPayloadSchema = GroupScopePayloadSchema;
export const GroupLinkRemovedPayloadSchema = z.object({
  orgId: z.string().uuid(),
  groupId: z.string().uuid(),
  members: z.array(ActorSchema).max(MEMBERS_PER_EVENT)
});
export const OrgMembershipRemovedPayloadSchema = ActorSchema.extend({ orgId: z.string().uuid() });

export const OrgMembershipEventPayloadSchema = z.union([
  GroupScopePayloadSchema,
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

// Big lists are paged across events so each fits the outbox; an empty one is still one page.
const page = <T>(items: T[], size: number): T[][] => (items.length ? chunkArray(items, size) : [[]]);

// One event per (org page, member page), so every member is rechecked in every org.
const pageGroupScope = (orgIds: string[], members: TOrgMembershipActor[]) =>
  page([...new Set(orgIds)], ORGS_PER_EVENT).flatMap((orgPage) =>
    page(members, MEMBERS_PER_EVENT).map((memberPage) => ({ orgIds: orgPage, members: memberPage }))
  );

export const emitGroupMembershipRemoved = async (
  eventEmitter: TEventEmitter,
  { groupId, orgIds, actors }: { groupId: string; orgIds: string[]; actors: TOrgMembershipActor[] },
  tx?: Knex
) => {
  if (!actors.length) return;
  await emitAll(
    eventEmitter,
    pageGroupScope(orgIds, actors).map((scope) => ({
      eventType: GROUP_MEMBERSHIP_REMOVED_EVENT,
      payload: { groupId, ...scope }
    })),
    tx
  );
};

export const emitGroupLinkRemoved = (
  eventEmitter: TEventEmitter,
  { orgId, groupId, members }: { orgId: string; groupId: string; members: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    page(members, MEMBERS_PER_EVENT).map((memberPage) => ({
      eventType: GROUP_LINK_REMOVED_EVENT,
      payload: { orgId, groupId, members: memberPage }
    })),
    tx
  );

export const emitGroupRemoved = (
  eventEmitter: TEventEmitter,
  { groupId, orgIds, members }: { groupId: string; orgIds: string[]; members: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    pageGroupScope(orgIds, members).map((scope) => ({
      eventType: GROUP_REMOVED_EVENT,
      payload: { groupId, ...scope }
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
