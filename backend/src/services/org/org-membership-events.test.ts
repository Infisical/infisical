import { ActorType } from "@app/services/auth/auth-type";
import { MAX_OUTBOX_PAYLOAD_BYTES, TEventInput } from "@app/services/event-outbox/event-outbox-types";

import {
  emitGroupLinkRemoved,
  emitGroupMembershipRemoved,
  emitGroupRemoved,
  emitOrgMembershipRemoved,
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  GroupMembershipRemovedPayloadSchema,
  GroupRemovedPayloadSchema,
  ORG_MEMBERSHIP_REMOVED_EVENT,
  toOrgMembershipActors
} from "./org-membership-events";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TX = { sentinel: true } as never;
const ORG = uuid(1);
const GROUP = uuid(2);
const USER = uuid(10);
const IDENTITY = uuid(20);

const buildEmitter = () => {
  const emitted: { event: TEventInput; tx: unknown }[] = [];
  return {
    emitted,
    eventEmitter: {
      emit: async (event: TEventInput, tx?: unknown) => {
        emitted.push({ event, tx });
      }
    }
  };
};

describe("org membership events", () => {
  test("toOrgMembershipActors dedupes and tags each kind", () => {
    expect(toOrgMembershipActors({ userIds: [USER, USER], identityIds: [IDENTITY] })).toEqual([
      { actorType: ActorType.USER, actorId: USER },
      { actorType: ActorType.IDENTITY, actorId: IDENTITY }
    ]);
    expect(toOrgMembershipActors({})).toEqual([]);
  });

  test("group membership removed carries the group's orgs and the members who left", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    await emitGroupMembershipRemoved(
      eventEmitter,
      {
        groupId: GROUP,
        orgIds: [ORG, ORG],
        actors: toOrgMembershipActors({ userIds: [USER], identityIds: [IDENTITY] })
      },
      TX
    );

    expect(emitted).toEqual([
      {
        event: {
          eventType: GROUP_MEMBERSHIP_REMOVED_EVENT,
          payload: {
            groupId: GROUP,
            orgIds: [ORG],
            members: [
              { actorType: ActorType.USER, actorId: USER },
              { actorType: ActorType.IDENTITY, actorId: IDENTITY }
            ]
          }
        },
        tx: TX
      }
    ]);

    const { emitted: none, eventEmitter: noneEmitter } = buildEmitter();
    await emitGroupMembershipRemoved(noneEmitter, { groupId: GROUP, orgIds: [ORG], actors: [] }, TX);
    expect(none).toEqual([]);
  });

  test("group link removed carries its members, paged, and still emits with no members", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    const members = toOrgMembershipActors({ userIds: Array.from({ length: 150 }, (_, i) => uuid(5000 + i)) });
    await emitGroupLinkRemoved(eventEmitter, { orgId: ORG, groupId: GROUP, members }, TX);

    expect(emitted).toHaveLength(2);
    for (const { event, tx } of emitted) {
      expect(tx).toBe(TX);
      expect(event.eventType).toBe(GROUP_LINK_REMOVED_EVENT);
      expect(event.payload).toMatchObject({ orgId: ORG, groupId: GROUP });
      expect((event.payload as { members: unknown[] }).members.length).toBeLessThanOrEqual(100);
    }

    const { emitted: empty, eventEmitter: emptyEmitter } = buildEmitter();
    await emitGroupLinkRemoved(emptyEmitter, { orgId: ORG, groupId: GROUP, members: [] }, TX);
    expect(empty).toEqual([
      { event: { eventType: GROUP_LINK_REMOVED_EVENT, payload: { orgId: ORG, groupId: GROUP, members: [] } }, tx: TX }
    ]);
  });

  test("group removed still emits for an empty group with only its own org", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    await emitGroupRemoved(eventEmitter, { groupId: GROUP, orgIds: [ORG], members: [] });
    expect(emitted).toEqual([
      {
        event: { eventType: GROUP_REMOVED_EVENT, payload: { groupId: GROUP, orgIds: [ORG], members: [] } },
        tx: undefined
      }
    ]);
  });

  describe.each([
    ["group membership removed", GROUP_MEMBERSHIP_REMOVED_EVENT, GroupMembershipRemovedPayloadSchema],
    ["group removed", GROUP_REMOVED_EVENT, GroupRemovedPayloadSchema]
  ])("%s with a group linked into hundreds of sub-orgs", (_, eventType, schema) => {
    test("pages both lists so every payload fits the outbox and every member is rechecked in every org", async () => {
      const { emitted, eventEmitter } = buildEmitter();
      const orgIds = Array.from({ length: 450 }, (__, i) => uuid(1000 + i));
      const members = toOrgMembershipActors({ userIds: Array.from({ length: 250 }, (__, i) => uuid(5000 + i)) });

      if (eventType === GROUP_REMOVED_EVENT) {
        await emitGroupRemoved(eventEmitter, { groupId: GROUP, orgIds, members }, TX);
      } else {
        await emitGroupMembershipRemoved(eventEmitter, { groupId: GROUP, orgIds, actors: members }, TX);
      }

      expect(emitted).toHaveLength(5 * 3);
      const covered = new Set<string>();
      for (const { event, tx } of emitted) {
        expect(tx).toBe(TX);
        expect(event.eventType).toBe(eventType);
        expect(Buffer.byteLength(JSON.stringify(event.payload), "utf8")).toBeLessThan(MAX_OUTBOX_PAYLOAD_BYTES);
        const payload = schema.parse(event.payload);
        for (const orgId of payload.orgIds) {
          for (const member of payload.members) covered.add(`${orgId}:${member.actorId}`);
        }
      }
      expect(covered.size).toBe(orgIds.length * members.length);
    });
  });

  test("org membership removed is one event per actor", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    await emitOrgMembershipRemoved(eventEmitter, { orgId: ORG, actors: toOrgMembershipActors({ userIds: [USER] }) });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toEqual({
      eventType: ORG_MEMBERSHIP_REMOVED_EVENT,
      payload: { orgId: ORG, actorType: ActorType.USER, actorId: USER }
    });
  });
});
