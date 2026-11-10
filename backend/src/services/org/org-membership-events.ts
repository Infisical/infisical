import { Knex } from "knex";

import {
  groupLinkRemovedEvents,
  groupMembershipRemovedEvents,
  groupRemovedEvents,
  orgMembershipRemovedEvents,
  TOrgMembershipActor
} from "@app/domains/platform/access-control/ce/module";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export {
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
  toOrgMembershipActors
} from "@app/domains/platform/access-control/ce/module";
export type { TOrgMembershipActor, TOrgMembershipEventPayload } from "@app/domains/platform/access-control/ce/module";

// Legacy services emit on their own Knex transaction; the events themselves are Access Control's.

export const emitGroupMembershipRemoved = async (
  eventEmitter: TEventEmitter,
  args: { groupId: string; orgIds: string[]; actors: TOrgMembershipActor[] },
  tx?: Knex
) => {
  const events = groupMembershipRemovedEvents(args);
  if (!events.length) return;
  await eventEmitter.emit(events, tx);
};

export const emitGroupLinkRemoved = (
  eventEmitter: TEventEmitter,
  args: { orgId: string; groupId: string; members: TOrgMembershipActor[] },
  tx?: Knex
) => eventEmitter.emit(groupLinkRemovedEvents(args), tx);

export const emitGroupRemoved = (
  eventEmitter: TEventEmitter,
  args: { groupId: string; orgIds: string[]; members: TOrgMembershipActor[] },
  tx?: Knex
) => eventEmitter.emit(groupRemovedEvents(args), tx);

export const emitOrgMembershipRemoved = (
  eventEmitter: TEventEmitter,
  args: { orgId: string; actors: TOrgMembershipActor[] },
  tx?: Knex
) => eventEmitter.emit(orgMembershipRemovedEvents(args), tx);
