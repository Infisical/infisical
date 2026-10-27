import crypto from "node:crypto";

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

export enum OrgAccessRemovalCause {
  RemovedFromGroup = "removed-from-group",
  GroupUnlinkedFromOrg = "group-unlinked-from-org",
  GroupDeleted = "group-deleted",
  RemovedFromOrg = "removed-from-org"
}

export const ORG_ACCESS_REMOVAL_CAUSE_BY_EVENT: Record<(typeof ORG_MEMBERSHIP_EVENTS)[number], OrgAccessRemovalCause> =
  {
    [GROUP_MEMBERSHIP_REMOVED_EVENT]: OrgAccessRemovalCause.RemovedFromGroup,
    [GROUP_LINK_REMOVED_EVENT]: OrgAccessRemovalCause.GroupUnlinkedFromOrg,
    [GROUP_REMOVED_EVENT]: OrgAccessRemovalCause.GroupDeleted,
    [ORG_MEMBERSHIP_REMOVED_EVENT]: OrgAccessRemovalCause.RemovedFromOrg
  };

// Keeps each event well under MAX_OUTBOX_PAYLOAD_BYTES (~4 KB of org ids, ~6 KB of members). A group can be
// linked into any number of sub-orgs, so both lists need a cap.
const ORGS_PER_EVENT = 100;
const MEMBERS_PER_EVENT = 100;

const ActorSchema = z.object({
  actorType: z.enum([ActorType.USER, ActorType.IDENTITY]),
  actorId: z.string().uuid()
});
export type TOrgMembershipActor = z.infer<typeof ActorSchema>;

// Group events snapshot orgs and members at removal time, since a later removal or the delete cascade can
// wipe those rows before the consumer runs. orgIds includes the group's own org.
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

const emitAll = (eventEmitter: TEventEmitter, type: string, payloads: Record<string, unknown>[], tx?: Knex) =>
  eventEmitter.emit(
    payloads.map((data): TEventInput => ({ id: crypto.randomUUID(), type, data })),
    tx
  );

// An empty list is still one page, so the event still goes out.
const page = <T>(items: T[], size: number): T[][] => (items.length ? chunkArray(items, size) : [[]]);

// One event per (org page, member page) so every member gets rechecked in every org.
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
    GROUP_MEMBERSHIP_REMOVED_EVENT,
    pageGroupScope(orgIds, actors).map((scope) => ({ groupId, ...scope })),
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
    GROUP_LINK_REMOVED_EVENT,
    page(members, MEMBERS_PER_EVENT).map((memberPage) => ({ orgId, groupId, members: memberPage })),
    tx
  );

export const emitGroupRemoved = (
  eventEmitter: TEventEmitter,
  { groupId, orgIds, members }: { groupId: string; orgIds: string[]; members: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    GROUP_REMOVED_EVENT,
    pageGroupScope(orgIds, members).map((scope) => ({ groupId, ...scope })),
    tx
  );

export const emitOrgMembershipRemoved = (
  eventEmitter: TEventEmitter,
  { orgId, actors }: { orgId: string; actors: TOrgMembershipActor[] },
  tx?: Knex
) =>
  emitAll(
    eventEmitter,
    ORG_MEMBERSHIP_REMOVED_EVENT,
    actors.map((actor) => ({ orgId, ...actor })),
    tx
  );
