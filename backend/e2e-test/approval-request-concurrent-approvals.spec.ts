import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import {
  ApprovalNotificationEvent,
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { approvalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import { TApprovalActor, TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import {
  approvalRequestApprovalsDALFactory,
  approvalRequestDALFactory,
  approvalRequestStepEligibleApproversDALFactory,
  approvalRequestStepsDALFactory,
  TApprovalRequestDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import { createApprovalRequestWithSteps } from "@app/services/approval-policy/approval-request-fns";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { NotificationType } from "@app/services/notification/notification-types";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { waitUntilBlockedBy } from "./testUtils/poll";
import { createUser, deleteUsers } from "./testUtils/users";

const approvalRequestDAL = approvalRequestDALFactory(testDb);
const approvalRequestStepsDAL = approvalRequestStepsDALFactory(testDb);
const approvalRequestStepEligibleApproversDAL = approvalRequestStepEligibleApproversDALFactory(testDb);
const approvalRequestApprovalsDAL = approvalRequestApprovalsDALFactory(testDb);
const userGroupMembershipDAL = userGroupMembershipDALFactory(testDb);

const asApprover = (userId: string, orgId: string): TApprovalActor => ({
  id: userId,
  type: ActorType.USER,
  authMethod: AuthMethod.EMAIL,
  orgId
});

// The service is driven directly, with real approval DALs and a stand-in certificate-request resource that
// records each post-approval run and approved notification, so the test can count them.
const buildService = () => {
  const routineRuns: { actorId?: string }[] = [];
  const delivered: { userId: string; title: string }[] = [];

  const resource: TApprovalResource = {
    matchPolicy: async () => null,
    canAccess: async () => null,
    validateConstraints: () => ({ valid: true }),
    postApprovalRoutine: async (request, actor) => {
      routineRuns.push({ actorId: actor?.id });
    },
    buildNotification: async ({ event }) =>
      event === ApprovalNotificationEvent.Approved
        ? { inApp: { type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED, title: "Approved", body: "" } }
        : null
  };

  const serviceWith = (dal: TApprovalRequestDALFactory) =>
    approvalPolicyServiceFactory({
      approvalRequestDAL: dal,
      approvalRequestStepsDAL,
      approvalRequestApprovalsDAL,
      userGroupMembershipDAL,
      permissionService: { getOrgPermission: async () => ({}) },
      notificationService: {
        createUserNotifications: async (rows: { userId: string; title: string }[]) => {
          delivered.push(...rows.map(({ userId, title }) => ({ userId, title })));
        }
      },
      resources: { [ApprovalPolicyType.CertRequest]: resource }
    } as unknown as Parameters<typeof approvalPolicyServiceFactory>[0]);

  return { serviceWith, routineRuns, delivered };
};

const setUp = async (requiredApprovals: number) => {
  const fixture = await createIsolatedOrgAndProject("approval-race");
  const requester = await createUser("requester");
  const approverA = await createUser("approver-a");
  const approverB = await createUser("approver-b");

  const [policy] = await testDb(TableName.ApprovalPolicies)
    .insert({
      projectId: fixture.projectId,
      organizationId: fixture.orgId,
      type: ApprovalPolicyType.CertRequest,
      name: "two approvers",
      conditions: JSON.stringify({ version: 1, conditions: [] }),
      constraints: JSON.stringify({ version: 1, constraints: {} })
    })
    .returning("id");

  const request = await createApprovalRequestWithSteps(
    {
      projectId: fixture.projectId,
      organizationId: fixture.orgId,
      policyId: (policy as { id: string }).id,
      policyType: ApprovalPolicyType.CertRequest,
      policySteps: [
        {
          requiredApprovals,
          approvers: [
            { type: ApproverType.User, id: approverA.userId },
            { type: ApproverType.User, id: approverB.userId }
          ]
        }
      ],
      requestData: {
        profileId: randomUUID(),
        profileName: "web-servers",
        certificateRequestId: randomUUID(),
        certificateRequest: { commonName: "app.example.com", validity: { ttl: "30d" } }
      },
      requesterUserId: requester.userId,
      requesterName: "requester",
      requesterEmail: requester.username
    },
    { approvalRequestDAL, approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL }
  );

  return {
    fixture,
    requestId: request.id,
    requesterId: requester.userId,
    approverA: asApprover(approverA.userId, fixture.orgId),
    approverB: asApprover(approverB.userId, fixture.orgId),
    approverName: (userId?: string) =>
      ({ [approverA.userId]: "approver A", [approverB.userId]: "approver B" })[userId ?? ""] ?? userId,
    userIds: [requester.userId, approverA.userId, approverB.userId]
  };
};

const approvedNoticesTo = (delivered: { userId: string; title: string }[], userId: string) =>
  delivered.filter((notice) => notice.userId === userId && notice.title === "Approved").length;

describe("approving a certificate request", () => {
  let ctx: Awaited<ReturnType<typeof setUp>>;

  afterEach(async () => {
    await ctx.fixture.cleanup();
    await deleteUsers(ctx.userIds);
  });

  describe("when one approval completes it", () => {
    beforeEach(async () => {
      ctx = await setUp(1);
    });

    test("runs the post-approval routine and tells the requester once", async () => {
      const { serviceWith, routineRuns, delivered } = buildService();

      const { request } = await serviceWith(approvalRequestDAL).approveRequest(
        ctx.requestId,
        {},
        ctx.approverA,
        ApprovalPolicyType.CertRequest
      );

      expect(request.status).toBe(ApprovalRequestStatus.Approved);
      expect(routineRuns.map((run) => ctx.approverName(run.actorId))).toEqual(["approver A"]);
      expect(approvedNoticesTo(delivered, ctx.requesterId)).toBe(1);
    });
  });

  describe("when the second of two required approvals lands while the first is still finishing", () => {
    beforeEach(async () => {
      ctx = await setUp(2);
    });

    // A's transaction records the first approval and holds the request's row lock until B's approval is
    // waiting on it. B then records the second approval and completes the request, all before A reads the
    // request back after its own commit. The timeout sits above waitUntilBlockedBy's 5s, so a B that never blocks
    // fails the test with that wait's error after B has finished, not with Vitest's.
    test("runs the post-approval routine and tells the requester once, for the approval that completed it", async () => {
      const { serviceWith, routineRuns, delivered } = buildService();

      const dalForA: TApprovalRequestDALFactory = {
        ...approvalRequestDAL,
        transaction: async <T>(cb: (tx: Knex) => Promise<T>) => {
          let approvalB: Promise<unknown> = Promise.resolve();
          const approvalA = approvalRequestDAL.transaction(async (tx) => {
            const committed = await cb(tx);
            const { rows } = await tx.raw("select pg_backend_pid() as pid");
            approvalB = serviceWith(approvalRequestDAL).approveRequest(
              ctx.requestId,
              {},
              ctx.approverB,
              ApprovalPolicyType.CertRequest
            );
            // B can only finish before it blocks by failing, so stop waiting then rather than time out.
            await Promise.race([waitUntilBlockedBy(rows[0].pid as number), approvalB.catch(() => undefined)]);
            return committed;
          });
          // B is awaited however A's transaction ends, so it never runs on into afterEach, and its error comes
          // first because a failed B is what ended A's wait.
          await Promise.allSettled([approvalA]);
          await approvalB;
          return approvalA;
        }
      };

      await serviceWith(dalForA).approveRequest(ctx.requestId, {}, ctx.approverA, ApprovalPolicyType.CertRequest);

      const stored = await approvalRequestDAL.findById(ctx.requestId);
      expect(stored.status).toBe(ApprovalRequestStatus.Approved);
      expect(routineRuns.map((run) => ctx.approverName(run.actorId))).toEqual(["approver B"]);
      expect(approvedNoticesTo(delivered, ctx.requesterId)).toBe(1);
    }, 15_000);
  });
});
