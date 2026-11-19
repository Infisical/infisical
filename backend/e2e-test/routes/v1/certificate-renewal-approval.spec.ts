import { randomUUID } from "node:crypto";

import { OrgMembershipRole, ProjectMembershipRole, ResourceMembershipRole, TableName } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApprovalRequestStatus, CertRequestRenewalApproval } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertificateRequestStatus } from "@app/services/certificate-common/certificate-constants";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { NotificationType } from "@app/services/notification/notification-types";

import { flushAuditLogs, listAuditLogs, TAuditLog } from "../../testUtils/audit-logs";
import {
  approveCertRequestApproval,
  createApplicationCertRequestPolicy,
  listApplicationCertRequestApprovals,
  rejectCertRequestApproval,
  renewalApprovalsFor
} from "../../testUtils/cert-approvals";
import { removeApplicationMember } from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";
import {
  addApplicationUser,
  createPkiApplication,
  getCertificate,
  issueCertificate,
  renewCertificate,
  runCertificateAutoRenewal,
  setCertificateRenewBeforeDays,
  TPkiApplication
} from "../../testUtils/pki";
import { pollUntil } from "../../testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const DOMAIN = "renewal-approval.example.com";
const CERTIFICATE_TTL = "10d";
const CERTIFICATE_TTL_DAYS = 10;

type TApplicationContext = {
  authToken: string;
  orgId: string;
  app: TPkiApplication;
  approverId: string;
  approverToken: string;
  startedAt: Date;
  cleanup: () => Promise<void>;
};

const setUpApplication = async (namePrefix: string): Promise<TApplicationContext> => {
  const startedAt = new Date(Date.now() - 60_000);
  const { orgId, authToken, cleanup } = await createIsolatedOrgAndProject(namePrefix);
  const app = await createPkiApplication({ authToken, namePrefix, domain: DOMAIN });

  const { userId: approverId } = await createUser("renewal-approver");
  await addUserMembership({ userId: approverId, orgId, role: OrgMembershipRole.Member });
  await addUserMembership({ userId: approverId, orgId, projectId: app.projectId, role: ProjectMembershipRole.Member });
  await addApplicationUser({ authToken, app, userId: approverId, role: ResourceMembershipRole.Admin });
  const approverToken = await createUserAccessToken({ userId: approverId, orgId });

  return {
    authToken,
    orgId,
    app,
    approverId,
    approverToken,
    startedAt,
    cleanup: async () => {
      await cleanup();
      await deleteUsers([approverId]);
    }
  };
};

const issue = async (ctx: TApplicationContext) => {
  const issued = await issueCertificate({
    authToken: ctx.authToken,
    app: ctx.app,
    commonName: `${randomUUID().slice(0, 8)}.${DOMAIN}`,
    ttl: CERTIFICATE_TTL
  });
  expect(issued.certificate?.certificateId, "the certificate was issued before any policy existed").toBeTruthy();
  return issued.certificate!.certificateId;
};

// Auto-renewal is turned on through the API, which only accepts a window that opens tomorrow at the
// earliest. The job decides eligibility from the dates alone, so widening the window to the whole
// validity period stands in for the days passing until the certificate is due.
const makeDueForAutoRenewal = async (ctx: TApplicationContext, certificateId: string) => {
  await setCertificateRenewBeforeDays({ authToken: ctx.authToken, certificateId, renewBeforeDays: 1 });
  await testDb(TableName.Certificate).where({ id: certificateId }).update({ renewBeforeDays: CERTIFICATE_TTL_DAYS });
};

const renewalApprovals = async (ctx: TApplicationContext, certificateId: string) =>
  renewalApprovalsFor(
    await listApplicationCertRequestApprovals({ authToken: ctx.authToken, applicationId: ctx.app.applicationId }),
    certificateId
  );

const pendingRenewalApprovals = async (ctx: TApplicationContext, certificateId: string) =>
  (await renewalApprovals(ctx, certificateId)).filter((req) => req.status === ApprovalRequestStatus.Pending);

const auditLogsSinceStart = async (ctx: TApplicationContext, eventTypes: EventType[]) =>
  listAuditLogs({ authToken: ctx.authToken, projectId: ctx.app.projectId, eventTypes, startDate: ctx.startedAt });

const failedAutoRenewalsOf = async (ctx: TApplicationContext, certificateId: string) => {
  await flushAuditLogs({ authToken: ctx.authToken, projectId: ctx.app.projectId, certificateId });
  return (await auditLogsSinceStart(ctx, [EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED])).filter(
    (log: TAuditLog) => log.event.metadata.certificateId === certificateId
  );
};

const expectRenewedBy = async (ctx: TApplicationContext, certificateId: string) => {
  const original = await getCertificate({ authToken: ctx.authToken, certificateId });
  expect(original.renewedByCertificateId, "the original certificate shows it was renewed").toBeTruthy();

  const renewed = await getCertificate({ authToken: ctx.authToken, certificateId: original.renewedByCertificateId! });
  expect(renewed.status, "the renewed certificate is active").toBe(CertStatus.ACTIVE);
  expect(renewed.commonName, "the renewed certificate keeps the subject").toBe(original.commonName);
  expect(renewed.serialNumber, "the renewed certificate is a new certificate").not.toBe(original.serialNumber);
  return renewed;
};

const expectNotRenewed = async (ctx: TApplicationContext, certificateId: string, reason: string) => {
  const certificate = await getCertificate({ authToken: ctx.authToken, certificateId });
  expect(certificate.renewedByCertificateId ?? null, `${reason}: no certificate was issued`).toBeNull();
  expect(certificate.status, `${reason}: the certificate is still active`).toBe(CertStatus.ACTIVE);
  expect(certificate.revokedAt ?? null, `${reason}: the certificate is not revoked`).toBeNull();
};

// Each audit log assertion polls the drained stream for up to 20 seconds.
const TEST_TIMEOUT_MS = 60_000;

describe("Certificate renewal approval", async () => {
  let restoreLicense: () => void;

  beforeAll(() => {
    restoreLicense = overrideLicenseFeatures({
      pkiApprovals: true,
      maxCas: 100,
      maxInternalCas: 100,
      auditLogs: true,
      auditLogsRetentionDays: 30
    });
  });

  afterAll(() => {
    restoreLicense?.();
  });

  describe("an issuance policy left on the default renewal approval", async () => {
    let ctx: TApplicationContext;
    let certificateId = "";

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-default");
      certificateId = await issue(ctx);

      const policy = await createApplicationCertRequestPolicy({
        authToken: ctx.authToken,
        applicationId: ctx.app.applicationId,
        profileSlug: ctx.app.profileSlug,
        approverUserId: ctx.approverId
      });
      expect(policy.constraints.constraints.renewalApproval, "a policy without the setting approves on change").toBe(
        CertRequestRenewalApproval.OnChange
      );
    });

    afterAll(async () => {
      await ctx?.cleanup();
    });

    test(
      "renews an unchanged certificate at once, without an approval request",
      async () => {
        const renewal = await renewCertificate({ authToken: ctx.authToken, certificateId });

        expect(renewal.status, "an unchanged renewal is issued").toBe(CertificateRequestStatus.ISSUED);
        expect(renewal.certificateId, "the renewal returns the new certificate").toBeTruthy();
        expect(await renewalApprovals(ctx, certificateId), "no approval request was raised").toHaveLength(0);

        const renewed = await expectRenewedBy(ctx, certificateId);
        expect(renewed.id).toBe(renewal.certificateId);

        await flushAuditLogs({ authToken: ctx.authToken, projectId: ctx.app.projectId, certificateId });
        const renewEvents = (await auditLogsSinceStart(ctx, [EventType.RENEW_CERTIFICATE])).filter(
          (log) => log.event.metadata.originalCertificateId === certificateId
        );
        expect(
          renewEvents.map((log) => log.event.metadata.status),
          "the renewal is audited as issued"
        ).toEqual([CertificateRequestStatus.ISSUED]);
      },
      TEST_TIMEOUT_MS
    );
  });

  describe("an issuance policy that requires approval for every renewal, renewed by hand", async () => {
    let ctx: TApplicationContext;
    let certificateId = "";
    let deletedRequesterCertificateId = "";

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-always-manual");
      certificateId = await issue(ctx);
      deletedRequesterCertificateId = await issue(ctx);

      const policy = await createApplicationCertRequestPolicy({
        authToken: ctx.authToken,
        applicationId: ctx.app.applicationId,
        profileSlug: ctx.app.profileSlug,
        approverUserId: ctx.approverId,
        constraints: { renewalApproval: CertRequestRenewalApproval.Always }
      });
      expect(policy.constraints.constraints.renewalApproval).toBe(CertRequestRenewalApproval.Always);
    });

    afterAll(async () => {
      await ctx?.cleanup();
    });

    test(
      "holds an unchanged renewal for approval, renews once approved, and audits who approved it",
      async () => {
        const renewal = await renewCertificate({ authToken: ctx.authToken, certificateId });

        expect(renewal.status, "the unchanged renewal waits for approval").toBe(
          CertificateRequestStatus.PENDING_APPROVAL
        );
        expect(renewal.certificateId, "the held renewal returns no certificate").toBe("");
        await expectNotRenewed(ctx, certificateId, "while the renewal waits");

        const pending = await pendingRenewalApprovals(ctx, certificateId);
        expect(pending, "one approval request names the certificate").toHaveLength(1);
        const [approvalRequest] = pending;

        const approved = await approveCertRequestApproval({
          authToken: ctx.approverToken,
          requestId: approvalRequest.id,
          comment: "renewal approved"
        });
        expect(approved.status, "the approver's decision is recorded").toBe(ApprovalRequestStatus.Approved);

        await expectRenewedBy(ctx, certificateId);

        await flushAuditLogs({ authToken: ctx.authToken, projectId: ctx.app.projectId, certificateId });

        const approveEvents = (await auditLogsSinceStart(ctx, [EventType.APPROVAL_REQUEST_APPROVE])).filter(
          (log) => log.event.metadata.approvalRequestId === approvalRequest.id
        );
        expect(approveEvents, "the approval is audited once").toHaveLength(1);
        const [approveEvent] = approveEvents;
        expect(approveEvent.actor.type, "the approval is audited as the approver's action").toBe(ActorType.USER);
        expect(approveEvent.actor.metadata.userId, "the approval names the approver").toBe(ctx.approverId);
        expect(approveEvent.event.metadata.certificateId, "the approval names the renewed certificate").toBe(
          certificateId
        );

        const renewEvents = (await auditLogsSinceStart(ctx, [EventType.RENEW_CERTIFICATE])).filter(
          (log) => log.event.metadata.originalCertificateId === certificateId
        );
        expect(
          renewEvents.map((log) => log.event.metadata.approvalRequestId),
          "the renewal's audit event carries the approval request"
        ).toContain(approvalRequest.id);
      },
      TEST_TIMEOUT_MS
    );

    test(
      "keeps automatic renewal when the person who asked for a rejected renewal was deleted first",
      async () => {
        const heldCertificateId = deletedRequesterCertificateId;
        const { userId: requesterId } = await createUser("renewal-requester");
        await addUserMembership({ userId: requesterId, orgId: ctx.orgId, role: OrgMembershipRole.Member });
        await addUserMembership({
          userId: requesterId,
          orgId: ctx.orgId,
          projectId: ctx.app.projectId,
          role: ProjectMembershipRole.Member
        });
        await addApplicationUser({
          authToken: ctx.authToken,
          app: ctx.app,
          userId: requesterId,
          role: ResourceMembershipRole.Admin
        });
        const requesterToken = await createUserAccessToken({ userId: requesterId, orgId: ctx.orgId });

        const renewal = await renewCertificate({ authToken: requesterToken, certificateId: heldCertificateId });
        expect(renewal.status, "the renewal waits for approval").toBe(CertificateRequestStatus.PENDING_APPROVAL);
        const [approvalRequest] = await pendingRenewalApprovals(ctx, heldCertificateId);

        await deleteUsers([requesterId]);
        const stored = await testDb(TableName.ApprovalRequests).where({ id: approvalRequest.id }).first();
        expect(stored?.requesterId ?? null, "deleting the user cleared the request's requester").toBeNull();

        const rejected = await rejectCertRequestApproval({
          authToken: ctx.approverToken,
          requestId: approvalRequest.id
        });
        expect(rejected.status).toBe(ApprovalRequestStatus.Rejected);

        const certificate = await getCertificate({ authToken: ctx.authToken, certificateId: heldCertificateId });
        expect(certificate.renewalError ?? null, "the rejection didn't stop automatic renewal").toBeNull();
      },
      TEST_TIMEOUT_MS
    );
  });

  describe("an issuance policy that requires approval for every renewal, renewed automatically", async () => {
    let ctx: TApplicationContext;
    const certificateIds = { approved: "", rejected: "", heldByHand: "", heldPastExpiry: "" };

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-always-auto");
      certificateIds.approved = await issue(ctx);
      certificateIds.rejected = await issue(ctx);
      certificateIds.heldByHand = await issue(ctx);
      certificateIds.heldPastExpiry = await issue(ctx);

      await createApplicationCertRequestPolicy({
        authToken: ctx.authToken,
        applicationId: ctx.app.applicationId,
        profileSlug: ctx.app.profileSlug,
        approverUserId: ctx.approverId,
        constraints: { renewalApproval: CertRequestRenewalApproval.Always }
      });
    });

    afterAll(async () => {
      await ctx?.cleanup();
    });

    test(
      "raises one approval request per due certificate and renews once it is approved",
      async () => {
        const certificateId = certificateIds.approved;
        await makeDueForAutoRenewal(ctx, certificateId);

        await runCertificateAutoRenewal();

        const pending = await pendingRenewalApprovals(ctx, certificateId);
        expect(pending, "the job raised one approval request for the certificate").toHaveLength(1);
        expect(pending[0].requesterName, "the request comes from automatic renewal").toBe("Automatic Renewal");
        await expectNotRenewed(ctx, certificateId, "after the job raised the request");

        await runCertificateAutoRenewal();

        expect(await renewalApprovals(ctx, certificateId), "a second run raised no second request").toHaveLength(1);
        expect(await failedAutoRenewalsOf(ctx, certificateId), "neither run recorded a failed renewal").toHaveLength(0);

        const approved = await approveCertRequestApproval({ authToken: ctx.approverToken, requestId: pending[0].id });
        expect(approved.status).toBe(ApprovalRequestStatus.Approved);

        await expectRenewedBy(ctx, certificateId);
      },
      TEST_TIMEOUT_MS
    );

    test(
      "stops renewing a certificate automatically once its renewal is rejected",
      async () => {
        const certificateId = certificateIds.rejected;
        await makeDueForAutoRenewal(ctx, certificateId);

        await runCertificateAutoRenewal();

        const pending = await pendingRenewalApprovals(ctx, certificateId);
        expect(pending, "the job raised one approval request for the certificate").toHaveLength(1);

        const rejected = await rejectCertRequestApproval({
          authToken: ctx.approverToken,
          requestId: pending[0].id,
          comment: "not this time"
        });
        expect(rejected.status).toBe(ApprovalRequestStatus.Rejected);
        await expectNotRenewed(ctx, certificateId, "after the rejection");

        await runCertificateAutoRenewal();

        expect(
          await pendingRenewalApprovals(ctx, certificateId),
          "the next run raised no new request for the rejected certificate"
        ).toHaveLength(0);
        await expectNotRenewed(ctx, certificateId, "after the next run");
      },
      TEST_TIMEOUT_MS
    );

    test(
      "leaves a renewal already waiting on a manual request alone",
      async () => {
        const certificateId = certificateIds.heldByHand;
        await makeDueForAutoRenewal(ctx, certificateId);

        const renewal = await renewCertificate({ authToken: ctx.authToken, certificateId });
        expect(renewal.status, "the manual renewal waits for approval").toBe(CertificateRequestStatus.PENDING_APPROVAL);

        await runCertificateAutoRenewal();

        expect(
          await failedAutoRenewalsOf(ctx, certificateId),
          "the job recorded no failed renewal for the held certificate"
        ).toHaveLength(0);
        expect(
          await renewalApprovals(ctx, certificateId),
          "the job raised no request beside the manual one"
        ).toHaveLength(1);
        await expectNotRenewed(ctx, certificateId, "while the manual renewal waits");
      },
      TEST_TIMEOUT_MS
    );

    // The hourly cleanup is what marks an expired request, so until it runs one stays pending in the database.
    test(
      "asks again for a renewal whose pending request has passed its expiry",
      async () => {
        const certificateId = certificateIds.heldPastExpiry;
        await makeDueForAutoRenewal(ctx, certificateId);
        const expire = (requestId: string) =>
          testDb(TableName.ApprovalRequests)
            .where({ id: requestId })
            .update({ expiresAt: new Date(Date.now() - 60_000) });

        const manual = await renewCertificate({ authToken: ctx.authToken, certificateId });
        expect(manual.status, "the manual renewal waits for approval").toBe(CertificateRequestStatus.PENDING_APPROVAL);
        const [manualRequest] = await pendingRenewalApprovals(ctx, certificateId);
        await expire(manualRequest.id);

        await runCertificateAutoRenewal();

        const jobRequests = (await pendingRenewalApprovals(ctx, certificateId)).filter(
          (req) => req.requesterName === "Automatic Renewal"
        );
        expect(jobRequests, "the job raised a request past the expired one").toHaveLength(1);
        await expire(jobRequests[0].id);

        const again = await renewCertificate({ authToken: ctx.authToken, certificateId });
        expect(again.status, "a manual renewal isn't refused by expired requests").toBe(
          CertificateRequestStatus.PENDING_APPROVAL
        );
      },
      TEST_TIMEOUT_MS
    );
  });
  describe("an automatic renewal still waiting after its policy goes back to the default", async () => {
    let ctx: TApplicationContext;
    let certificateId = "";
    let policyId = "";

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-policy-switched");
      certificateId = await issue(ctx);
      ({ id: policyId } = await createApplicationCertRequestPolicy({
        authToken: ctx.authToken,
        applicationId: ctx.app.applicationId,
        profileSlug: ctx.app.profileSlug,
        approverUserId: ctx.approverId,
        constraints: { renewalApproval: CertRequestRenewalApproval.Always }
      }));
    });

    afterAll(async () => {
      await ctx?.cleanup();
    });

    test(
      "keeps waiting for the request the job raised instead of renewing around it",
      async () => {
        await makeDueForAutoRenewal(ctx, certificateId);
        await runCertificateAutoRenewal();
        const [pending] = await pendingRenewalApprovals(ctx, certificateId);
        expect(pending?.requesterName, "the job raised a request under Every renewal").toBe("Automatic Renewal");

        const switched = await testServer.inject({
          method: "PATCH",
          url: `/api/v1/approval-policies/cert-request/${policyId}`,
          headers: { authorization: `Bearer ${ctx.authToken}` },
          body: { constraints: { renewalApproval: CertRequestRenewalApproval.OnChange } }
        });
        expect(switched.statusCode, switched.payload).toBe(200);

        await runCertificateAutoRenewal();

        await expectNotRenewed(ctx, certificateId, "while the job's own request still waits");
        expect(await renewalApprovals(ctx, certificateId), "the job raised no second request").toHaveLength(1);
        expect(await failedAutoRenewalsOf(ctx, certificateId), "the job recorded no failed renewal").toHaveLength(0);

        await approveCertRequestApproval({ authToken: ctx.approverToken, requestId: pending.id });
        await expectRenewedBy(ctx, certificateId);
      },
      TEST_TIMEOUT_MS
    );
  });

  describe("an approved renewal that fails after an approver left the Application", async () => {
    let ctx: TApplicationContext;
    let certificateId = "";
    let removedApproverId = "";
    let removedApproverToken = "";

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-failure-notice");
      certificateId = await issue(ctx);

      ({ userId: removedApproverId } = await createUser("renewal-removed-approver"));
      await addUserMembership({ userId: removedApproverId, orgId: ctx.orgId, role: OrgMembershipRole.Member });
      await addUserMembership({
        userId: removedApproverId,
        orgId: ctx.orgId,
        projectId: ctx.app.projectId,
        role: ProjectMembershipRole.Member
      });
      await addApplicationUser({
        authToken: ctx.authToken,
        app: ctx.app,
        userId: removedApproverId,
        role: ResourceMembershipRole.Admin
      });
      removedApproverToken = await createUserAccessToken({ userId: removedApproverId, orgId: ctx.orgId });

      await createApplicationCertRequestPolicy({
        authToken: ctx.authToken,
        applicationId: ctx.app.applicationId,
        profileSlug: ctx.app.profileSlug,
        approverUserId: ctx.approverId,
        otherApproverUserIds: [removedApproverId],
        constraints: { renewalApproval: CertRequestRenewalApproval.Always }
      });
    });

    afterAll(async () => {
      await deleteUsers([removedApproverId]);
      await ctx?.cleanup();
    });

    const failureNotices = async (token: string, requestId: string) =>
      (await listUserNotifications(token)).filter(
        (n) => n.type === NotificationType.APPROVED_ACTION_FAILED && n.link?.includes(`/approvals/${requestId}`)
      );

    test(
      "tells the requester and current approvers why, and not an approver removed from the Application",
      async () => {
        await renewCertificate({ authToken: ctx.authToken, certificateId });
        const [approvalRequest] = await pendingRenewalApprovals(ctx, certificateId);
        expect(approvalRequest, "the renewal waits for approval").toBeDefined();

        await removeApplicationMember({
          applicationId: ctx.app.applicationId,
          kind: "users",
          memberId: removedApproverId,
          authToken: ctx.authToken
        });
        await testDb(TableName.CertificateAuthority).where({ id: ctx.app.caId }).update({ status: CaStatus.DISABLED });

        await approveCertRequestApproval({ authToken: ctx.approverToken, requestId: approvalRequest.id });

        // The requester always gets the notice, so once theirs arrives the whole batch is written.
        const [requesterNotice] = await pollUntil({
          describe: `the requester's failure notice for request ${approvalRequest.id}`,
          read: () => failureNotices(ctx.authToken, approvalRequest.id),
          done: (notices) => notices.length > 0
        });
        expect(requesterNotice?.title, "the requester hears the renewal failed").toBe("Certificate Renewal Failed");
        expect(requesterNotice?.body, "the notice gives the reason").toContain("Certificate Authority is disabled");
        expect(
          await failureNotices(ctx.approverToken, approvalRequest.id),
          "the approver still in the Application hears"
        ).toHaveLength(1);
        expect(
          await failureNotices(removedApproverToken, approvalRequest.id),
          "the approver removed from the Application isn't told"
        ).toHaveLength(0);
        await expectNotRenewed(ctx, certificateId, "after the approved renewal failed");
      },
      TEST_TIMEOUT_MS
    );
  });
});
