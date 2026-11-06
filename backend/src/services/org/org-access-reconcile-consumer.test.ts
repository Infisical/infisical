import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";
import { TRevokedProjectAccess } from "@app/services/membership/project-access-revoke-service";

import { ACTORS_PER_RECONCILE_TX, orgAccessReconcileConsumerFactory } from "./org-access-reconcile-consumer";
import {
  GROUP_LINK_REMOVED_EVENT,
  GROUP_MEMBERSHIP_REMOVED_EVENT,
  GROUP_REMOVED_EVENT,
  ORG_MEMBERSHIP_REMOVED_EVENT,
  OrgAccessRemovalCause
} from "./org-membership-events";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_ID = uuid(1);
const SUB_ORG_ID = uuid(2);
const USER_ID = uuid(10);
const IDENTITY_ID = uuid(20);
const GROUP_ID = uuid(30);
const PROJECT_A = uuid(40);
const PROJECT_B = uuid(41);

const makeEvent = (type: string, data: Record<string, unknown>, id = uuid(9000)): TEvent => ({
  specversion: "1.0",
  id,
  source: "infisical",
  type,
  time: new Date().toISOString(),
  data,
  isFinalAttempt: false
});
const userRemovedFromOrg = (orgId = ORG_ID) =>
  makeEvent(ORG_MEMBERSHIP_REMOVED_EVENT, { orgId, actorType: ActorType.USER, actorId: USER_ID });

// The revoke service only reports actors it found rows for.
const build = (opts?: {
  withAccess?: { userIds?: string[]; identityIds?: string[] };
  // The mock stamps the org it was called for, like the real service does from the rows.
  revoked?: Omit<TRevokedProjectAccess, "orgId">[];
  orgs?: Record<string, unknown>;
  childOrgs?: string[];
}) => {
  const tx = { raw: vi.fn().mockResolvedValue(undefined) };
  const primary = { node: "primary" };
  const sendPamCancellations = vi.fn();
  const deps = {
    orgDAL: {
      primaryNode: vi.fn(() => primary),
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
      lockActorsForOrgAccess: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb(tx))
    },
    projectAccessRevokeService: {
      revokeActorsInOrgs: vi.fn(
        async ({
          orgIds,
          userIds = [],
          identityIds = []
        }: {
          orgIds: string[];
          userIds?: string[];
          identityIds?: string[];
        }) => ({
          revoked: (opts?.revoked ?? [])
            .filter(
              (entry) =>
                (entry.userId && userIds.includes(entry.userId)) ||
                (entry.identityId && identityIds.includes(entry.identityId))
            )
            .map((entry) => ({ ...entry, orgId: orgIds[0] })),
          sendPamCancellations
        })
      )
    },
    auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
    usageMeteringService: { emit: vi.fn() }
  };
  const consumer = orgAccessReconcileConsumerFactory(deps as never);
  return { consumer, deps, tx, primary, sendPamCancellations };
};

const auditMetadata = (deps: ReturnType<typeof build>["deps"], call = 0) =>
  (deps.auditLogService.createAuditLog.mock.calls[call] as [{ event: { metadata: Record<string, unknown> } }])[0].event
    .metadata;

describe("org access reconcile consumer", () => {
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
      const { consumer, deps, primary } = build({ childOrgs: [SUB_ORG_ID] });

      await consumer.handle([userRemovedFromOrg()]);

      expect(deps.orgDAL.find).toHaveBeenCalledWith({ rootOrgId: ORG_ID }, { tx: primary });
      expect(deps.orgDAL.findById).toHaveBeenCalledWith(ORG_ID, primary);
      expect(deps.orgDAL.findActorsWithOrgAccess).toHaveBeenCalledTimes(2);
    });
  });

  test("keeps everything when the actor still reaches the org by any path", async () => {
    const { consumer, deps } = build({
      withAccess: { userIds: [USER_ID] },
      revoked: [{ userId: USER_ID, projectIds: [PROJECT_A], resources: [] }]
    });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.projectAccessRevokeService.revokeActorsInOrgs).not.toHaveBeenCalled();
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    expect(deps.usageMeteringService.emit).not.toHaveBeenCalled();
  });

  // A group with no org rows names no orgs, so the actual reconcile is driven by an org membership event.
  test("revokes the actor's project access in the org, under the actor lock, when no path remains", async () => {
    const { consumer, deps, tx, sendPamCancellations } = build({
      revoked: [{ userId: USER_ID, projectIds: [PROJECT_A, PROJECT_B], resources: [] }]
    });

    const [result] = await consumer.handle([
      makeEvent(GROUP_MEMBERSHIP_REMOVED_EVENT, {
        groupId: GROUP_ID,
        orgIds: [],
        members: [{ actorType: ActorType.USER, actorId: USER_ID }]
      })
    ]);
    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.orgDAL.transaction).not.toHaveBeenCalled();

    const [orgResult] = await consumer.handle([userRemovedFromOrg()]);

    expect(orgResult.status).toBe(EventResultStatus.Delivered);
    expect(deps.orgDAL.lockActorsForOrgAccess).toHaveBeenCalledWith({ orgId: ORG_ID, actorIds: [USER_ID] }, tx);
    expect(deps.projectAccessRevokeService.revokeActorsInOrgs).toHaveBeenCalledWith(
      { orgIds: [ORG_ID], userIds: [USER_ID], identityIds: [] },
      tx
    );
    expect(sendPamCancellations).toHaveBeenCalledTimes(1);

    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.REVOKE_ORG_PROJECT_ACCESS,
          metadata: {
            userId: USER_ID,
            identityId: undefined,
            projectIds: [PROJECT_A, PROJECT_B],
            resources: [],
            reason: OrgAccessRemovalCause.RemovedFromOrg,
            groupId: undefined
          }
        }
      })
    );
    expect(deps.usageMeteringService.emit).toHaveBeenCalledTimes(3);
  });

  test("records the identity and the group that carried the lost path, and says which grants went", async () => {
    const { consumer, deps, tx } = build({
      revoked: [
        {
          identityId: IDENTITY_ID,
          projectIds: [PROJECT_A],
          resources: [{ projectId: PROJECT_A, resourceType: "pam-account", resourceId: uuid(302) }]
        }
      ]
    });

    const [result] = await consumer.handle([
      makeEvent(GROUP_MEMBERSHIP_REMOVED_EVENT, {
        groupId: GROUP_ID,
        orgIds: [ORG_ID],
        members: [{ actorType: ActorType.IDENTITY, actorId: IDENTITY_ID }]
      })
    ]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.projectAccessRevokeService.revokeActorsInOrgs).toHaveBeenCalledWith(
      { orgIds: [ORG_ID], userIds: [], identityIds: [IDENTITY_ID] },
      tx
    );
    expect(auditMetadata(deps)).toEqual({
      userId: undefined,
      identityId: IDENTITY_ID,
      projectIds: [PROJECT_A],
      resources: [{ projectId: PROJECT_A, resourceType: "pam-account", resourceId: uuid(302) }],
      reason: OrgAccessRemovalCause.RemovedFromGroup,
      groupId: GROUP_ID
    });
  });

  test("a replay that finds nothing left writes no audit entry and emits no meters", async () => {
    const { consumer, deps, sendPamCancellations } = build({ revoked: [] });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.projectAccessRevokeService.revokeActorsInOrgs).toHaveBeenCalledTimes(1);
    expect(sendPamCancellations).toHaveBeenCalledTimes(1);
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    expect(deps.usageMeteringService.emit).not.toHaveBeenCalled();
  });

  test("treats an org deleted before the run as delivered with nothing to do", async () => {
    const { consumer, deps } = build({ orgs: {} });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.orgDAL.transaction).not.toHaveBeenCalled();
  });

  test("retries the event when one org fails and still reconciles the others", async () => {
    const { consumer, deps } = build({
      orgs: { [ORG_ID]: new Error("connection reset"), [SUB_ORG_ID]: { id: SUB_ORG_ID } },
      childOrgs: [SUB_ORG_ID],
      revoked: [{ userId: USER_ID, projectIds: [PROJECT_A], resources: [] }]
    });

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Retry);
    expect(result.error).toContain(ORG_ID);
    expect(deps.orgDAL.transaction).toHaveBeenCalledTimes(1);
    expect(deps.projectAccessRevokeService.revokeActorsInOrgs).toHaveBeenCalledWith(
      expect.objectContaining({ orgIds: [SUB_ORG_ID] }),
      expect.anything()
    );
  });

  test("retries the event when a lookup before reconciling fails", async () => {
    const { consumer, deps } = build();
    deps.orgDAL.find.mockRejectedValueOnce(new Error("connection reset"));

    const [result] = await consumer.handle([userRemovedFromOrg()]);

    expect(result.status).toBe(EventResultStatus.Retry);
    expect(result.error).toContain("connection reset");
    expect(deps.orgDAL.transaction).not.toHaveBeenCalled();
  });

  test("fails terminally on a payload it cannot read or an event it does not know", async () => {
    const { consumer } = build();

    const [bad, unknown] = await consumer.handle([
      makeEvent(ORG_MEMBERSHIP_REMOVED_EVENT, { orgId: "not-a-uuid" }),
      makeEvent("com.infisical.organization.something.happened.v1", {}, uuid(9001))
    ]);

    expect(bad.status).toBe(EventResultStatus.Failed);
    expect(bad.error).toContain("Unreadable org membership event");
    expect(unknown.status).toBe(EventResultStatus.Failed);
  });

  test("splits the actors into short, time-boxed transactions and logs each batch after it commits", async () => {
    const userIds = Array.from({ length: ACTORS_PER_RECONCILE_TX + 1 }, (_, i) => uuid(200 + i));
    const { consumer, deps, tx } = build({
      revoked: userIds.map((userId) => ({ userId, projectIds: [PROJECT_A], resources: [] }))
    });

    const [result] = await consumer.handle([
      makeEvent(GROUP_LINK_REMOVED_EVENT, {
        orgId: ORG_ID,
        groupId: GROUP_ID,
        members: userIds.map((actorId) => ({ actorType: ActorType.USER, actorId }))
      })
    ]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(deps.orgDAL.transaction).toHaveBeenCalledTimes(2);
    expect(tx.raw).toHaveBeenCalledTimes(2);
    expect(tx.raw).toHaveBeenCalledWith(expect.stringContaining("SET LOCAL statement_timeout"));
    expect(deps.orgDAL.lockActorsForOrgAccess).toHaveBeenNthCalledWith(
      1,
      { orgId: ORG_ID, actorIds: userIds.slice(0, ACTORS_PER_RECONCILE_TX) },
      tx
    );
    expect(deps.orgDAL.lockActorsForOrgAccess).toHaveBeenNthCalledWith(
      2,
      { orgId: ORG_ID, actorIds: userIds.slice(ACTORS_PER_RECONCILE_TX) },
      tx
    );
    expect(deps.auditLogService.createAuditLog).toHaveBeenCalledTimes(userIds.length);
  });
});
