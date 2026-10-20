import { ActorType } from "@app/services/auth/auth-type";
import { TEventInput } from "@app/services/event-outbox/event-outbox-types";

import {
  emitGroupLinkRemoved,
  emitGroupMembershipRemoved,
  emitGroupRemoved,
  emitOrgMembershipRemoved,
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
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

  test("group membership removed is one event per actor and passes the transaction through", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    await emitGroupMembershipRemoved(
      eventEmitter,
      { groupId: GROUP, actors: toOrgMembershipActors({ userIds: [USER], identityIds: [IDENTITY] }) },
      TX
    );

    expect(emitted).toHaveLength(2);
    expect(emitted.every((e) => e.tx === TX && e.event.eventType === GROUP_MEMBERSHIP_REMOVED_EVENT)).toBe(true);
    expect(emitted[0].event.payload).toEqual({ groupId: GROUP, actorType: ActorType.USER, actorId: USER });
    expect(emitted[1].event.payload).toEqual({ groupId: GROUP, actorType: ActorType.IDENTITY, actorId: IDENTITY });
  });

  test("group link removed is one event", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    await emitGroupLinkRemoved(eventEmitter, { orgId: ORG, groupId: GROUP }, TX);
    expect(emitted).toEqual([
      { event: { eventType: GROUP_LINK_REMOVED_EVENT, payload: { orgId: ORG, groupId: GROUP } }, tx: TX }
    ]);
  });

  test("group removed carries its snapshot, pages a large member list and still emits with no members", async () => {
    const { emitted, eventEmitter } = buildEmitter();
    const members = toOrgMembershipActors({ userIds: Array.from({ length: 250 }, (_, i) => uuid(5000 + i)) });
    await emitGroupRemoved(eventEmitter, { orgId: ORG, groupId: GROUP, linkedOrgIds: [uuid(3), uuid(3)], members }, TX);

    expect(emitted).toHaveLength(3);
    for (const { event } of emitted) {
      expect(event.eventType).toBe(GROUP_REMOVED_EVENT);
      expect(event.payload).toMatchObject({ orgId: ORG, groupId: GROUP, linkedOrgIds: [uuid(3)] });
      expect((event.payload as { members: unknown[] }).members.length).toBeLessThanOrEqual(100);
      expect(JSON.stringify(event.payload).length).toBeLessThan(16 * 1024);
    }

    const { emitted: empty, eventEmitter: emptyEmitter } = buildEmitter();
    await emitGroupRemoved(emptyEmitter, { orgId: ORG, groupId: GROUP, linkedOrgIds: [], members: [] });
    expect(empty).toHaveLength(1);
    expect(empty[0].event.payload).toEqual({ orgId: ORG, groupId: GROUP, linkedOrgIds: [], members: [] });
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
