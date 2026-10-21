import { AccessScope } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";
import { ApplicationMemberKind } from "@app/services/pki-application/pki-application-types";

import { orgAccessReconcileConsumerFactory } from "./org-access-reconcile-consumer";
import {
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  ORG_MEMBERSHIP_REMOVED_EVENT
} from "./org-membership-events";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));
const { sendPamCancellations, terminatePamSessionsForUsers } = vi.hoisted(() => {
  const cancel = vi.fn();
  return { sendPamCancellations: cancel, terminatePamSessionsForUsers: vi.fn(async () => cancel) };
});
vi.mock("@app/ee/services/pam-session/pam-session-access-fns", () => ({ terminatePamSessionsForUsers }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_ID = uuid(1);
const SUB_ORG_ID = uuid(2);
const USER_ID = uuid(10);
const IDENTITY_ID = uuid(20);
const GROUP_ID = uuid(30);
const PROJECT_A = uuid(40);
const PROJECT_B = uuid(41);
const PROJECT_C = uuid(42);

const makeEvent = (eventType: string, payload: Record<string, unknown>, id = 1): TEvent =>
  ({ id, eventType, payload, occurredAt: new Date() }) as TEvent;
const userRemovedFromOrg = (orgId = ORG_ID) =>
  makeEvent(ORG_MEMBERSHIP_REMOVED_EVENT, { orgId, actorType: ActorType.USER, actorId: USER_ID });

type TRow = { id: string; actorUserId?: string; actorIdentityId?: string; scopeProjectId: string };

const build = (opts?: {
  withAccess?: { userIds?: string[]; identityIds?: string[] };
  projectRows?: TRow[];
  orgs?: Record<string, unknown>;
  childOrgs?: string[];
}) => {
  const tx = { sentinel: true };
  const deps = {
    orgDAL: {
      findById: vi.fn((id: string) => {
        const orgs = opts?.orgs ?? { [ORG_ID]: { id: ORG_ID }, [SUB_ORG_ID]: { id: SUB_ORG_ID } };
        const org = orgs[id];
        if (org instanceof Error) return Promise.reject(org);
        return Promise.resolve(org);
      }),
      find: vi.fn().mockResolvedValue((opts?.childOrgs ?? []).map((id) => ({ id }))),
      findActorsWithOrgAccess: vi.fn().mockResolvedValue({
        userIds: new Set(opts?.withAccess?.userIds ?? []),
        identityIds: new Set(opts?.withAccess?.identityIds ?? [])
      }),
      lockActorsForOrgAccess: vi.fn().mockResolvedValue(undefined)
    },
    projectDAL: { find: vi.fn().mockResolvedValue([{ id: PROJECT_A }, { id: PROJECT_B }, { id: PROJECT_C }]) },
    membershipDAL: {
      find: vi.fn((filter: { $in?: { actorUserId?: string[]; actorIdentityId?: string[] } }) => {
        const rows = opts?.projectRows ?? [];
        if (filter.$in?.actorUserId) return Promise.resolve(rows.filter((row) => Boolean(row.actorUserId)));
        return Promise.resolve(rows.filter((row) => Boolean(row.actorIdentityId)));
      }),
      delete: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb(tx))
    },
    membershipRoleDAL: { delete: vi.fn().mockResolvedValue([]) },
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue([]) },
    projectKeyDAL: { delete: vi.fn().mockResolvedValue([]) },
    approvalPolicyDAL: { deleteUserStepApproversInProjects: vi.fn().mockResolvedValue(undefined) },
    applicationMembershipCleanupService: {
      cleanupActorApplicationMemberships: vi.fn().mockResolvedValue(undefined),
      cleanupUsersApplicationMemberships: vi.fn().mockResolvedValue(undefined)
    },
    alertChannelRecipientDAL: { pruneOutOfScopeRecipients: vi.fn().mockResolvedValue(0) },
    pamSessionDAL: { findLiveByOrgAndUserIds: vi.fn(), update: vi.fn() },
    gatewayV2Service: { getPAMConnectionDetails: vi.fn() },
    auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
    usageMeteringService: { emit: vi.fn() }
  };
  const consumer = orgAccessReconcileConsumerFactory(deps as never);
  return { consumer, deps, tx };
};

describe("org access reconcile consumer", () => {
  beforeEach(() => {
    sendPamCancellations.mockClear();
    terminatePamSessionsForUsers.mockClear();
  });

  test("subscribes to the four org membership events only", () => {
    const { consumer } = build();
    for (const eventType of [
      GROUP_MEMBERSHIP_REMOVED_EVENT,
      GROUP_LINK_REMOVED_EVENT,
      GROUP_REMOVED_EVENT,
      ORG_MEMBERSHIP_REMOVED_EVENT
    ]) {
      expect(consumer.subscribesTo(eventType)).toBe(true);
    }
    expect(consumer.subscribesTo("approval.workflow.request_opened")).toBe(false);
  });

  describe("works out which orgs and actors to recheck from each event", () => {
    test("a group membership removal rechecks the orgs the group held when the actor left it", async () => {
      const { consumer, deps } = build();

      await consumer.handle([
        makeEvent(GROUP_MEMBERSHIP_REMOVED_EVENT, {
          groupId: GROUP_ID,
          orgIds: [ORG_ID, SUB_ORG_ID],
          members: [{ actorType: ActorType.USER, actorId: USER_ID }]
        })
      ]);

      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledTimes(2);
      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledWith(
        { orgId: SUB_ORG_ID, userIds: [USER_ID], identityIds: [] },
        expect.anything()
      );
    });

    test("a group link removal rechecks the members the group had when it was unlinked", async () => {
      const { consumer, deps } = build();

      await consumer.handle([
        makeEvent(GROUP_LINK_REMOVED_EVENT, {
          orgId: SUB_ORG_ID,
          groupId: GROUP_ID,
          members: [
            { actorType: ActorType.USER, actorId: USER_ID },
            { actorType: ActorType.IDENTITY, actorId: IDENTITY_ID }
          ]
        })
      ]);

      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledWith(
        { orgId: SUB_ORG_ID, userIds: [USER_ID], identityIds: [IDENTITY_ID] },
        expect.anything()
      );
    });

    test("a group removal uses the snapshot the event carries, since the rows are gone", async () => {
      const { consumer, deps } = build();

      await consumer.handle([
        makeEvent(GROUP_REMOVED_EVENT, {
          groupId: GROUP_ID,
          orgIds: [ORG_ID, SUB_ORG_ID],
          members: [{ actorType: ActorType.IDENTITY, actorId: IDENTITY_ID }]
        })
      ]);

      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledTimes(2);
      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledWith(
        { orgId: SUB_ORG_ID, userIds: [], identityIds: [IDENTITY_ID] },
        expect.anything()
      );
    });

    test("an org membership removal also rechecks the org's sub-orgs", async () => {
      const { consumer, deps } = build({ childOrgs: [SUB_ORG_ID] });

      await consumer.handle([userRemovedFromOrg()]);

      expect(deps.orgDAL.find).toHaveBeenCalledWith({ rootOrgId: ORG_ID });
      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledTimes(2);
    });
  });

  test("keeps everything when the actor still reaches the org by any path", async () => {
    const { consumer, deps } = build({
      withAccess: { userIds: [USER_ID] },
      projectRows: [{ id: uuid(100), actorUserId: USER_ID, scopeProjectId: PROJECT_A }]
    });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(deps.additionalPrivilegeDAL.delete).not.toHaveBeenCalled();
    expect(deps.projectKeyDAL.delete).not.toHaveBeenCalled();
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    expect(deps.usageMeteringService.emit).not.toHaveBeenCalled();
  });

  test("revokes every project row, key, privilege and approver slot in the org when no path remains", async () => {
    const { consumer, deps, tx } = build({
      projectRows: [
        { id: uuid(100), actorUserId: USER_ID, scopeProjectId: PROJECT_A },
        { id: uuid(101), actorUserId: USER_ID, scopeProjectId: PROJECT_B }
      ]
    });

    const [result] = await consumer.handle([
      makeEvent(GROUP_MEMBERSHIP_REMOVED_EVENT, {
        groupId: GROUP_ID,
        orgIds: [],
        members: [{ actorType: ActorType.USER, actorId: USER_ID }]
      })
    ]);
    // a group that held no org rows names no orgs; drive the reconcile with an org membership event
    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.membershipDAL.transaction).not.toHaveBeenCalled();

    const [orgResult] = await consumer.handle([userRemovedFromOrg()]);

    expect(orgResult.status).toBe(EventResultStatus.Delivered);
    expect(deps.orgDAL.lockActorsForOrgAccess).toHaveBeenCalledWith([USER_ID], tx);
    expect(deps.membershipRoleDAL.delete).toHaveBeenCalledWith({ $in: { membershipId: [uuid(100), uuid(101)] } }, tx);
    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: [uuid(100), uuid(101)] } }, tx);
    // reaped across the whole org, not only the projects that had a row
    const allProjects = [PROJECT_A, PROJECT_B, PROJECT_C];
    expect(deps.additionalPrivilegeDAL.delete).toHaveBeenCalledWith(
      { $in: { actorUserId: [USER_ID], projectId: allProjects } },
      tx
    );
    expect(deps.projectKeyDAL.delete).toHaveBeenCalledWith(
      { $in: { receiverId: [USER_ID], projectId: allProjects } },
      tx
    );
    expect(deps.approvalPolicyDAL.deleteUserStepApproversInProjects).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds: allProjects, userIds: [USER_ID] }),
      tx
    );
    expect(deps.applicationMembershipCleanupService.cleanupUsersApplicationMemberships).toHaveBeenCalledTimes(2);
    expect(deps.alertChannelRecipientDAL.pruneOutOfScopeRecipients).toHaveBeenCalledWith({ userIds: [USER_ID] }, tx);
    expect(terminatePamSessionsForUsers).toHaveBeenCalledWith(
      expect.objectContaining({ orgIds: [ORG_ID], userIds: [USER_ID], tx })
    );
    expect(sendPamCancellations).toHaveBeenCalledTimes(1);

    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        event: {
          type: EventType.REVOKE_ORG_PROJECT_ACCESS,
          metadata: {
            userId: USER_ID,
            projectIds: [PROJECT_A, PROJECT_B],
            reason: ORG_MEMBERSHIP_REMOVED_EVENT,
            groupId: undefined
          }
        }
      })
    );
    expect(deps.usageMeteringService.emit).toHaveBeenCalledTimes(3);
  });

  test("revokes an identity's rows and application memberships and logs it under the identity with the group", async () => {
    const { consumer, deps, tx } = build({
      projectRows: [{ id: uuid(102), actorIdentityId: IDENTITY_ID, scopeProjectId: PROJECT_A }]
    });

    const [result] = await consumer.handle([
      makeEvent(GROUP_REMOVED_EVENT, {
        groupId: GROUP_ID,
        orgIds: [ORG_ID],
        members: [{ actorType: ActorType.IDENTITY, actorId: IDENTITY_ID }]
      })
    ]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: [uuid(102)] } }, tx);
    expect(deps.additionalPrivilegeDAL.delete).toHaveBeenCalledWith(
      { $in: { actorIdentityId: [IDENTITY_ID], projectId: [PROJECT_A, PROJECT_B, PROJECT_C] } },
      tx
    );
    expect(deps.applicationMembershipCleanupService.cleanupActorApplicationMemberships).toHaveBeenCalledWith(
      { projectId: PROJECT_A, actorKind: ApplicationMemberKind.Identity, actorId: IDENTITY_ID },
      tx
    );
    expect(deps.projectKeyDAL.delete).not.toHaveBeenCalled();
    const [auditCall] = deps.auditLogService.createAuditLog.mock.calls[0] as [
      { event: { metadata: Record<string, unknown> } }
    ];
    expect(auditCall.event.metadata).toMatchObject({
      identityId: IDENTITY_ID,
      projectIds: [PROJECT_A],
      reason: GROUP_REMOVED_EVENT,
      groupId: GROUP_ID
    });
  });

  test("a replay that finds no project rows left writes no audit entry and emits no meters", async () => {
    const { consumer, deps } = build({ projectRows: [] });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    expect(deps.usageMeteringService.emit).not.toHaveBeenCalled();
  });

  test("treats an org deleted before the run as delivered with nothing to do", async () => {
    const { consumer, deps } = build({ orgs: {} });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.membershipDAL.transaction).not.toHaveBeenCalled();
  });

  test("retries the event when one org fails and still reconciles the others", async () => {
    const { consumer, deps } = build({
      orgs: { [ORG_ID]: new Error("connection reset"), [SUB_ORG_ID]: { id: SUB_ORG_ID } },
      childOrgs: [SUB_ORG_ID],
      projectRows: [{ id: uuid(103), actorUserId: USER_ID, scopeProjectId: PROJECT_A }]
    });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Retry);
    expect(result.error).toContain(ORG_ID);
    expect(deps.membershipDAL.transaction).toHaveBeenCalledTimes(1);
    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: [uuid(103)] } }, expect.anything());
  });

  test("retries the event when a lookup before reconciling fails", async () => {
    const { consumer, deps } = build();
    deps.orgDAL.find.mockRejectedValueOnce(new Error("connection reset"));

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Retry);
    expect(result.error).toContain("connection reset");
    expect(deps.membershipDAL.transaction).not.toHaveBeenCalled();
  });

  test("still reaps when the group lost its link and its member before the events were handled", async () => {
    // the group no longer holds a row in the sub-org nor lists the user, so only the payloads say who to recheck
    const { consumer, deps } = build({
      projectRows: [{ id: uuid(105), actorUserId: USER_ID, scopeProjectId: PROJECT_A }]
    });

    const results = await consumer.handle([
      makeEvent(GROUP_MEMBERSHIP_REMOVED_EVENT, {
        groupId: GROUP_ID,
        orgIds: [SUB_ORG_ID],
        members: [{ actorType: ActorType.USER, actorId: USER_ID }]
      }),
      makeEvent(GROUP_LINK_REMOVED_EVENT, { orgId: SUB_ORG_ID, groupId: GROUP_ID, members: [] }, 2)
    ]);

    expect(results.map((result) => result.status)).toEqual([EventResultStatus.Delivered, EventResultStatus.Delivered]);
    expect(deps.membershipDAL.delete).toHaveBeenCalledWith({ $in: { id: [uuid(105)] } }, expect.anything());
    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ orgId: SUB_ORG_ID }));
  });

  test("fails terminally on a payload it cannot read or an event it does not know", async () => {
    const { consumer } = build();

    const [bad, unknown] = await consumer.handle([
      makeEvent(ORG_MEMBERSHIP_REMOVED_EVENT, { orgId: "not-a-uuid" }),
      makeEvent("com.infisical.organization.something.happened.v1", {}, 2)
    ]);

    expect(bad.status).toBe(EventResultStatus.Failed);
    expect(bad.error).toContain("Unreadable org membership event");
    expect(unknown.status).toBe(EventResultStatus.Failed);
  });

  test("scopes project rows by org when the DAL is asked", async () => {
    const { consumer, deps, tx } = build({
      projectRows: [{ id: uuid(104), actorUserId: USER_ID, scopeProjectId: PROJECT_A }]
    });

    await consumer.handle([userRemovedFromOrg()]);

    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      { scope: AccessScope.Project, scopeOrgId: ORG_ID, $in: { actorUserId: [USER_ID] } },
      { tx }
    );
    expect(deps.projectDAL.find).toHaveBeenCalledWith({ orgId: ORG_ID }, { tx });
  });
});
