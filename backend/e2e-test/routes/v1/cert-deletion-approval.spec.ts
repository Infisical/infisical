// A deletion approval policy holds the delete of every certificate on a profile it lists, whoever asks. Each test
// gets its own Application, with the same people in the same roles, so demoting an approver in one can't change
// what another sees.
import { OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { ResourceMembershipRole } from "@app/db/schemas/models";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApprovalPolicyType, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { CertificateDeletionStatus } from "@app/services/certificate/certificate-types";
import { NotificationType } from "@app/services/notification/notification-types";

import {
  addApplicationUsers,
  attachApiProfile,
  createActiveCertManagerProject,
  createApplicationWithApiProfile,
  createCertificateProfile,
  createDeletionApprovalPolicy,
  createInternalRootCa,
  decideDeletionRequest,
  deleteCertificate,
  deleteCertificateBySerialNumber,
  getDeletionRequest,
  issueApplicationCertificate,
  listProjectDeletionRequests,
  updateApplicationMemberRole,
  updateDeletionApprovalPolicy
} from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";
import { pollUntil } from "../../testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const COMMON_NAME = "delete-me.example.com";

type TUser = { userId: string; username: string; token: string };
type TAuditCall = { actor: { type: string }; event: { type: EventType; metadata: Record<string, unknown> } };

const auditLogService = () =>
  (globalThis as unknown as { testServices: { auditLog: { createAuditLog: (dto: unknown) => Promise<void> } } })
    .testServices.auditLog;

describe("Certificate deletion approval", { timeout: 60_000 }, () => {
  let restoreLicense: () => void;
  let cleanupOrg: () => Promise<void>;
  let adminToken = "";
  let orgId = "";
  let projectId = "";
  let caId = "";
  const createdUserIds: string[] = [];
  let auditSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ pkiApprovals: true, maxCas: 100, maxInternalCas: 100 });
    const isolated = await createIsolatedOrgAndProject("cert-deletion-approval");
    adminToken = isolated.authToken;
    orgId = isolated.orgId;
    cleanupOrg = isolated.cleanup;
    projectId = await createActiveCertManagerProject(adminToken);
    caId = await createInternalRootCa({ projectId, authToken: adminToken });
  });

  beforeEach(() => {
    // Recorded at the call: the e2e plan keeps no audit logs, so none reach the audit_logs table.
    auditSpy = vi.spyOn(auditLogService(), "createAuditLog");
  });

  afterEach(() => {
    auditSpy.mockRestore();
  });

  afterAll(async () => {
    restoreLicense?.();
    await cleanupOrg?.();
    await deleteUsers(createdUserIds);
  });

  const createMember = async (label: string): Promise<TUser> => {
    const { userId, username } = await createUser(label);
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.Member });
    return { userId, username, token: await createUserAccessToken({ userId, orgId }) };
  };

  // The org's admin creates the Application, so it is the Application's Admin. The policy covers `covered` and
  // names `approver`; `other` is an Operator the policy doesn't name.
  const setUp = async () => {
    const newProfile = () =>
      createCertificateProfile({ projectId, caId, commonNames: [COMMON_NAME], authToken: adminToken });
    const covered = await newProfile();
    const uncovered = await newProfile();
    const application = await createApplicationWithApiProfile({
      projectId,
      profileId: covered.id,
      authToken: adminToken
    });
    await attachApiProfile({ applicationId: application.id, profileId: uncovered.id, authToken: adminToken });

    const [operator, approver, other, auditor] = await Promise.all(
      ["operator", "approver", "other", "auditor"].map((label) => createMember(label))
    );
    const addRole = (users: TUser[], role: ResourceMembershipRole) =>
      addApplicationUsers({
        applicationId: application.id,
        userIds: users.map(({ userId }) => userId),
        role,
        authToken: adminToken
      });
    await addRole([operator, approver, other], ResourceMembershipRole.Operator);
    await addRole([auditor], ResourceMembershipRole.Auditor);

    const policy = await createDeletionApprovalPolicy({
      applicationId: application.id,
      profileSlug: covered.slug,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: approver.userId }] }],
      authToken: adminToken
    });

    const issue = (profileId: string) =>
      issueApplicationCertificate({
        profileId,
        applicationId: application.id,
        commonName: COMMON_NAME,
        authToken: adminToken
      });

    return { application, covered, uncovered, policy, operator, approver, other, auditor, issue };
  };

  const storedCertificate = (certificateId: string) =>
    testDb(TableName.Certificate)
      .where({ id: certificateId })
      .first<{ serialNumber: string; deletedAt: Date | null; deletedByActorType: string; deletedByActorId: string }>();

  const auditEvents = (type: EventType) =>
    auditSpy.mock.calls.map(([dto]) => dto as TAuditCall).filter(({ event }) => event.type === type);

  test("a covered certificate waits for approval, and approving it deletes the certificate as the requester", async () => {
    const { covered, approver, operator, issue } = await setUp();
    const certificateId = await issue(covered.id);

    const res = await deleteCertificate({ certificateId, authToken: operator.token }).raw();

    expect(res.statusCode, res.payload).toBe(202);
    const { status, approvalRequestId } = res.json<{ status: string; approvalRequestId: string }>();
    expect(status).toBe(CertificateDeletionStatus.PendingApproval);
    expect((await storedCertificate(certificateId))?.deletedAt).toBeNull();
    expect(auditEvents(EventType.REQUEST_CERT_DELETION)).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          metadata: expect.objectContaining({
            certId: certificateId,
            approvalRequestId,
            requesterEmail: operator.username
          })
        })
      })
    ]);
    expect(auditEvents(EventType.DELETE_CERT)).toEqual([]);

    const pending = await listProjectDeletionRequests({ projectId, authToken: approver.token });
    expect(pending.map(({ id }) => id)).toContain(approvalRequestId);
    expect((await getDeletionRequest({ requestId: approvalRequestId, authToken: operator.token })).canReview).toBe(
      false
    );
    expect((await getDeletionRequest({ requestId: approvalRequestId, authToken: approver.token })).canReview).toBe(
      true
    );

    const notices = await pollUntil({
      describe: "the approver's notice for the deletion request",
      read: async () =>
        (await listUserNotifications(approver.token)).filter(
          (n) => n.type === NotificationType.APPROVAL_REQUIRED && n.link?.includes(`/approvals/${approvalRequestId}`)
        ),
      done: (found) => found.length > 0
    });
    expect(notices[0].body).toBe(`operator asked to delete the certificate '${COMMON_NAME}'.`);
    expect(notices[0].link).toContain(`policyType=${ApprovalPolicyType.CertDeletion}&from=root-requests`);

    const decided = await decideDeletionRequest({
      requestId: approvalRequestId,
      decision: "approve",
      authToken: approver.token
    });

    expect(decided.status).toBe("approved");
    expect(await storedCertificate(certificateId)).toMatchObject({
      deletedAt: expect.any(Date) as unknown,
      deletedByActorType: ActorType.USER,
      deletedByActorId: operator.userId
    });
    expect(auditEvents(EventType.DELETE_CERT)).toEqual([
      expect.objectContaining({
        actor: expect.objectContaining({ type: ActorType.PLATFORM }),
        event: expect.objectContaining({
          metadata: expect.objectContaining({
            certId: certificateId,
            approvalRequestId,
            requesterName: "operator",
            requesterEmail: operator.username
          })
        })
      })
    ]);
  });

  test("rejecting a deletion request leaves the certificate in place, and it can be requested again", async () => {
    const { covered, approver, operator, issue } = await setUp();
    const certificateId = await issue(covered.id);
    const requestId = await deleteCertificate({ certificateId, authToken: operator.token });

    const decided = await decideDeletionRequest({ requestId, decision: "reject", authToken: approver.token });

    expect(decided.status).toBe("rejected");
    expect((await storedCertificate(certificateId))?.deletedAt).toBeNull();
    expect(auditEvents(EventType.DELETE_CERT)).toEqual([]);
    const again = await deleteCertificate({ certificateId, authToken: operator.token });
    expect(again).not.toBe(requestId);
  });

  test("an Application Admin is held too, and still deletes an uncovered certificate right away", async () => {
    const { covered, uncovered, issue } = await setUp();
    const coveredId = await issue(covered.id);
    const uncoveredId = await issue(uncovered.id);

    await deleteCertificate({ certificateId: coveredId, authToken: adminToken });
    const direct = await deleteCertificate({ certificateId: uncoveredId, authToken: adminToken }).raw();

    expect((await storedCertificate(coveredId))?.deletedAt).toBeNull();
    expect(direct.statusCode, direct.payload).toBe(200);
    expect(direct.json<{ certificate: { id: string } }>().certificate.id).toBe(uncoveredId);
    expect((await storedCertificate(uncoveredId))?.deletedAt).toBeInstanceOf(Date);
    expect(auditEvents(EventType.DELETE_CERT)).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({ metadata: expect.objectContaining({ certId: uncoveredId }) })
      })
    ]);
  });

  test("an Operator can request deletion of a covered certificate but can't delete an uncovered one", async () => {
    const { covered, uncovered, operator, issue } = await setUp();
    const coveredId = await issue(covered.id);
    const uncoveredId = await issue(uncovered.id);

    await deleteCertificate({ certificateId: coveredId, authToken: operator.token });
    const refused = await deleteCertificate({ certificateId: uncoveredId, authToken: operator.token }).raw();

    expect(refused.statusCode, refused.payload).toBe(403);
    expect(refused.json<{ message: string }>().message).toBe(
      `Certificate '${COMMON_NAME}' isn't covered by a deletion approval policy, so you need permission to delete it directly. Ask an Application Admin to delete it.`
    );
    expect((await storedCertificate(uncoveredId))?.deletedAt).toBeNull();
  });

  test("an Auditor can't request a deletion or be named as a deletion approver", async () => {
    const { application, covered, auditor, issue } = await setUp();
    const certificateId = await issue(covered.id);

    const refused = await deleteCertificate({ certificateId, authToken: auditor.token }).raw();
    const naming = await createDeletionApprovalPolicy({
      applicationId: application.id,
      profileSlug: covered.slug,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: auditor.userId }] }],
      authToken: adminToken
    }).raw();

    expect(refused.statusCode, refused.payload).toBe(403);
    expect((await storedCertificate(certificateId))?.deletedAt).toBeNull();
    expect(naming.statusCode, naming.payload).toBe(400);
    expect(naming.json<{ message: string }>().message).toBe(
      `Deletion approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: users auditor.`
    );
  });

  test("a second deletion is refused while the first is waiting for approval", async () => {
    const { covered, operator, other, issue } = await setUp();
    const certificateId = await issue(covered.id);
    await deleteCertificate({ certificateId, authToken: operator.token });

    const second = await deleteCertificate({ certificateId, authToken: other.token }).raw();

    expect(second.statusCode, second.payload).toBe(400);
    expect(second.json<{ message: string }>().message).toBe(
      `A deletion of certificate '${COMMON_NAME}' is already waiting for approval.`
    );
  });

  test("a deletion request whose only approver was demoted to Auditor is replaced by the next deletion", async () => {
    const { application, covered, policy, operator, approver, other, issue } = await setUp();
    const certificateId = await issue(covered.id);
    const requestId = await deleteCertificate({ certificateId, authToken: operator.token });
    await updateApplicationMemberRole({
      applicationId: application.id,
      kind: "users",
      memberId: approver.userId,
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });
    expect((await getDeletionRequest({ requestId, authToken: adminToken })).approversCanNoLongerApprove).toBe(true);
    // The stuck request's approver can't come back by itself, so the policy names `other` before deleting again.
    await updateDeletionApprovalPolicy({
      policyId: policy.id,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: other.userId }] }],
      authToken: adminToken
    });

    const replacementId = await deleteCertificate({ certificateId, authToken: operator.token });

    expect(replacementId).not.toBe(requestId);
    expect((await getDeletionRequest({ requestId, authToken: adminToken })).status).toBe("cancelled");
    const replacement = await getDeletionRequest({ requestId: replacementId, authToken: other.token });
    expect(replacement).toMatchObject({ status: "pending", canReview: true });
    expect(auditEvents(EventType.APPROVAL_REQUEST_CANCEL)).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          metadata: expect.objectContaining({
            approvalRequestId: requestId,
            reason: "The request's approvers can no longer approve it, so a new deletion request replaced it."
          })
        })
      })
    ]);
    expect((await storedCertificate(certificateId))?.deletedAt).toBeNull();
  });

  test("the deprecated serial number route holds a covered deletion and deletes an uncovered one", async () => {
    const { covered, uncovered, operator, issue } = await setUp();
    const coveredCert = await storedCertificate(await issue(covered.id));
    const uncoveredId = await issue(uncovered.id);
    const uncoveredCert = await storedCertificate(uncoveredId);

    const held = await deleteCertificateBySerialNumber({
      serialNumber: coveredCert!.serialNumber,
      authToken: operator.token
    }).raw();
    const direct = await deleteCertificateBySerialNumber({
      serialNumber: uncoveredCert!.serialNumber,
      authToken: adminToken
    }).raw();

    expect(held.statusCode, held.payload).toBe(202);
    expect(held.json<{ serialNumber: string }>().serialNumber).toBe(coveredCert!.serialNumber);
    expect(direct.statusCode, direct.payload).toBe(200);
    expect((await storedCertificate(uncoveredId))?.deletedAt).toBeInstanceOf(Date);
  });
});
