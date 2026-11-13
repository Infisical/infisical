import { randomUUID } from "node:crypto";

import { OrgMembershipRole, ProjectMembershipRole, ResourceMembershipRole, TableName } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApprovalRequestStatus, CertRequestRenewalApproval } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { CertificateRequestStatus } from "@app/services/certificate-common/certificate-constants";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { flushAuditLogs, listAuditLogs, TAuditLog } from "../../testUtils/audit-logs";
import {
  approveCertRequestApproval,
  createApplicationCertRequestPolicy,
  listApplicationCertRequestApprovals,
  rejectCertRequestApproval,
  renewalApprovalsFor
} from "../../testUtils/cert-approvals";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";
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
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const DOMAIN = "renewal-approval.example.com";
const CERTIFICATE_TTL = "10d";
const CERTIFICATE_TTL_DAYS = 10;

type TApplicationContext = {
  authToken: string;
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

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-always-manual");
      certificateId = await issue(ctx);

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
  });

  describe("an issuance policy that requires approval for every renewal, renewed automatically", async () => {
    let ctx: TApplicationContext;
    const certificateIds = { approved: "", rejected: "", heldByHand: "" };

    beforeAll(async () => {
      ctx = await setUpApplication("renewal-always-auto");
      certificateIds.approved = await issue(ctx);
      certificateIds.rejected = await issue(ctx);
      certificateIds.heldByHand = await issue(ctx);

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
  });
});
