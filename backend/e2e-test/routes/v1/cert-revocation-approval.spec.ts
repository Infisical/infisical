// A revocation request saves its approvers when it is raised, but whether a saved approver may still decide it is
// read live. Each test raises requests, then changes the approver's access through the route a user would, and
// checks what the approver can do and who hears about it.
//
// An approved revocation that fails tells the requester and the saved approvers who can still approve. Each test
// has its own CA, so deleting it (which deletes its certificates) between the request and its approval makes the
// approved revocation fail and send that notice.
import { ProjectMembershipRole, OrgMembershipRole, TableName } from "@app/db/schemas";
import { ResourceMembershipRole } from "@app/db/schemas/models";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { NotificationType } from "@app/services/notification/notification-types";

import {
  addApplicationGroup,
  addApplicationUsers,
  createActiveCertManagerProject,
  createApplicationWithApiProfile,
  createCertificateProfile,
  createInternalRootCa,
  createRevocationApprovalPolicy,
  decideRevocationRequest,
  deleteCertificateProfile,
  deleteInternalCa,
  detachApplicationProfile,
  getRevocationRequest,
  issueApplicationCertificate,
  removeApplicationMember,
  revokeCertificate,
  TRevocationPolicyStep,
  updateApplicationMemberRole
} from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createProjectGroup, deleteGroups, removeUserFromGroup } from "../../testUtils/groups";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";
import { pollUntil } from "../../testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const COMMON_NAME = "revoke-me.example.com";
const NO_APPROVING_ROLE =
  "You can't review this request because you no longer have a role in its Application that can approve requests.";
const NOT_ELIGIBLE = "You are not an eligible approver for this step";

type TApprover = { userId: string; username: string; token: string };
type TApprovers = { approver: TApprover; other: TApprover };

describe("Revocation approval when a saved approver's access changes", { timeout: 60_000 }, () => {
  let restoreLicense: () => void;
  let cleanupOrg: () => Promise<void>;
  let adminToken = "";
  let orgId = "";
  let projectId = "";
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ pkiApprovals: true, groups: true, maxCas: 100, maxInternalCas: 100 });
    const isolated = await createIsolatedOrgAndProject("cert-revocation-approval");
    adminToken = isolated.authToken;
    orgId = isolated.orgId;
    cleanupOrg = isolated.cleanup;
    projectId = await createActiveCertManagerProject(adminToken);
  });

  afterAll(async () => {
    restoreLicense?.();
    await deleteGroups(createdGroupIds);
    await cleanupOrg?.();
    await deleteUsers(createdUserIds);
  });

  const createApprover = async (label: string): Promise<TApprover> => {
    const { userId, username } = await createUser(label);
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.Member });
    return { userId, username, token: await createUserAccessToken({ userId, orgId }) };
  };

  // The org's admin creates the Application, so it is the Application's Admin and the requester. `approver` is the
  // saved approver whose access each test changes; `other` is a second approver who keeps Operator throughout.
  const setUp = async ({
    approverVia,
    approverRole = ResourceMembershipRole.Operator,
    steps,
    maxRequestTtl
  }: {
    approverVia: "user" | "group";
    approverRole?: ResourceMembershipRole;
    steps: (ids: { approver: { type: ApproverType; id: string }; otherId: string }) => TRevocationPolicyStep[];
    maxRequestTtl?: string;
  }) => {
    const caId = await createInternalRootCa({ projectId, authToken: adminToken });
    const profile = await createCertificateProfile({
      projectId,
      caId,
      commonNames: [COMMON_NAME],
      authToken: adminToken
    });
    const approver = await createApprover("approver");
    const other = await createApprover("other-approver");
    const application = await createApplicationWithApiProfile({
      projectId,
      profileId: profile.id,
      authToken: adminToken
    });
    await addApplicationUsers({
      applicationId: application.id,
      userIds: [other.userId],
      role: ResourceMembershipRole.Operator,
      authToken: adminToken
    });

    let groupId = "";
    if (approverVia === "user") {
      await addApplicationUsers({
        applicationId: application.id,
        userIds: [approver.userId],
        role: approverRole,
        authToken: adminToken
      });
    } else {
      ({ id: groupId } = await createProjectGroup({ orgId, projectId, userIds: [approver.userId] }));
      createdGroupIds.push(groupId);
      await addApplicationGroup({ applicationId: application.id, groupId, role: approverRole, authToken: adminToken });
    }

    const policy = await createRevocationApprovalPolicy({
      applicationId: application.id,
      profileSlug: profile.slug,
      steps: steps({
        approver:
          approverVia === "user"
            ? { type: ApproverType.User, id: approver.userId }
            : { type: ApproverType.Group, id: groupId },
        otherId: other.userId
      }),
      maxRequestTtl,
      authToken: adminToken
    });

    const issue = () =>
      issueApplicationCertificate({
        profileId: profile.id,
        applicationId: application.id,
        commonName: COMMON_NAME,
        authToken: adminToken
      });

    const raiseRequest = async () => {
      const certificateId = await issue();
      const requestId = await revokeCertificate({ certificateId, authToken: adminToken });
      return { certificateId, requestId };
    };

    // A CA can't be deleted while a profile uses it, nor a profile while an Application has it attached.
    const deleteCa = async () => {
      await detachApplicationProfile({ applicationId: application.id, profileId: profile.id, authToken: adminToken });
      await deleteCertificateProfile({ profileId: profile.id, authToken: adminToken });
      await deleteInternalCa({ caId, authToken: adminToken });
    };

    return { approver, other, application, groupId, policy, issue, raiseRequest, deleteCa };
  };

  type TFixture = TApprovers & { deleteCa: () => Promise<void> };

  const oneStep = ({ approver, otherId }: { approver: { type: ApproverType; id: string }; otherId: string }) => [
    { requiredApprovals: 1, approvers: [approver, { type: ApproverType.User, id: otherId }] }
  ];

  // The certificate's status is read from the database because a refused decision has no response that shows it.
  const certificateStatus = async (certificateId: string) =>
    (await testDb(TableName.Certificate).where({ id: certificateId }).first<{ status: string }>())?.status;

  const expectRefused = async (requestId: string, token: string, expected: { statusCode: number; message: string }) => {
    for (const decision of ["approve", "reject"] as const) {
      // eslint-disable-next-line no-await-in-loop
      await decideRevocationRequest({ requestId, decision, authToken: token }).expect((res) => {
        expect(res.statusCode, `${decision}: ${res.payload}`).toBe(expected.statusCode);
        expect(res.json().message, decision).toBe(expected.message);
      });
    }
  };

  const failureNotices = async (token: string, requestId: string) =>
    (await listUserNotifications(token)).filter(
      (n) => n.type === NotificationType.APPROVED_ACTION_FAILED && n.link?.includes(`/approvals/${requestId}`)
    );

  // Deletes the fixture's CA, so call it after every other check on the fixture's certificates. `other` then approves
  // and the revocation fails. The requester always gets the notice, so once theirs arrives the whole batch is written.
  const approveIntoFailure = async ({ other, deleteCa }: TFixture, requestId: string) => {
    await deleteCa();
    const decided = await decideRevocationRequest({ requestId, decision: "approve", authToken: other.token });
    expect(decided.status).toBe("approved");
    await pollUntil({
      describe: `the requester's failure notice for request ${requestId}`,
      read: () => failureNotices(adminToken, requestId),
      done: (notices) => notices.length > 0
    });
  };

  const expectCanStillDecide = async (fixture: TFixture, requests: { certificateId: string; requestId: string }[]) => {
    const { approver, other } = fixture;
    const [toApprove, toReject, toFail] = requests;

    expect((await getRevocationRequest({ requestId: toApprove.requestId, authToken: approver.token })).canReview).toBe(
      true
    );
    const approved = await decideRevocationRequest({
      requestId: toApprove.requestId,
      decision: "approve",
      authToken: approver.token
    });
    expect(approved.status).toBe("approved");
    expect(await certificateStatus(toApprove.certificateId)).toBe(CertStatus.REVOKED);

    const rejected = await decideRevocationRequest({
      requestId: toReject.requestId,
      decision: "reject",
      authToken: approver.token
    });
    expect(rejected.status).toBe("rejected");
    expect(await certificateStatus(toReject.certificateId)).toBe(CertStatus.ACTIVE);

    await approveIntoFailure(fixture, toFail.requestId);
    expect(await failureNotices(approver.token, toFail.requestId)).toHaveLength(1);
    expect(await failureNotices(other.token, toFail.requestId)).toHaveLength(1);
  };

  // An approver who still has a role in the Application can open the request but is told they can't review it. One
  // with no role left in it can't open the request at all.
  const expectLockedOut = async (
    fixture: TFixture,
    { certificateId, requestId }: { certificateId: string; requestId: string },
    { message, canOpenRequest }: { message: string; canOpenRequest: boolean }
  ) => {
    const { approver, other } = fixture;
    await expectRefused(requestId, approver.token, { statusCode: 403, message });
    if (canOpenRequest) {
      expect((await getRevocationRequest({ requestId, authToken: approver.token })).canReview).toBe(false);
    } else {
      await getRevocationRequest({ requestId, authToken: approver.token }).expect((res) => {
        expect(res.statusCode, res.payload).toBe(403);
        expect(res.json().message).toBe("You are not a member of this certificate-application.");
      });
    }
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);

    await approveIntoFailure(fixture, requestId);
    expect(await failureNotices(other.token, requestId)).toHaveLength(1);
    expect(await failureNotices(approver.token, requestId)).toHaveLength(0);
  };

  test.each([ResourceMembershipRole.Operator, ResourceMembershipRole.Admin])(
    "a direct %s approver can approve and reject, and hears about a failed revocation",
    async (role) => {
      const fixture = await setUp({ approverVia: "user", approverRole: role, steps: oneStep });
      const requests = [await fixture.raiseRequest(), await fixture.raiseRequest(), await fixture.raiseRequest()];

      await expectCanStillDecide(fixture, requests);
    }
  );

  test("an approver with an approving role through a group can approve and reject, and hears about a failed revocation", async () => {
    const fixture = await setUp({ approverVia: "group", steps: oneStep });
    const requests = [await fixture.raiseRequest(), await fixture.raiseRequest(), await fixture.raiseRequest()];

    await expectCanStillDecide(fixture, requests);
  });

  test("an approver removed from the Application can't decide and isn't told the revocation failed", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const pending = await fixture.raiseRequest();

    await removeApplicationMember({
      applicationId: fixture.application.id,
      kind: "users",
      memberId: fixture.approver.userId,
      authToken: adminToken
    });

    await expectLockedOut(fixture, pending, { message: NO_APPROVING_ROLE, canOpenRequest: false });
  });

  test("an approver whose group was removed from the Application can't decide and isn't told the revocation failed", async () => {
    const fixture = await setUp({ approverVia: "group", steps: oneStep });
    const pending = await fixture.raiseRequest();

    await removeApplicationMember({
      applicationId: fixture.application.id,
      kind: "groups",
      memberId: fixture.groupId,
      authToken: adminToken
    });

    await expectLockedOut(fixture, pending, { message: NO_APPROVING_ROLE, canOpenRequest: false });
  });

  test("an approver demoted to Auditor can't decide and isn't told the revocation failed", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const pending = await fixture.raiseRequest();

    await updateApplicationMemberRole({
      applicationId: fixture.application.id,
      kind: "users",
      memberId: fixture.approver.userId,
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });

    await expectLockedOut(fixture, pending, { message: NO_APPROVING_ROLE, canOpenRequest: true });
  });

  test("an approver whose group was demoted to Auditor can't decide and isn't told the revocation failed", async () => {
    const fixture = await setUp({ approverVia: "group", steps: oneStep });
    const pending = await fixture.raiseRequest();

    await updateApplicationMemberRole({
      applicationId: fixture.application.id,
      kind: "groups",
      memberId: fixture.groupId,
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });

    await expectLockedOut(fixture, pending, { message: NO_APPROVING_ROLE, canOpenRequest: true });
  });

  test("an approver removed from the group the step names can't decide and isn't told the revocation failed", async () => {
    const fixture = await setUp({ approverVia: "group", steps: oneStep });
    const pending = await fixture.raiseRequest();

    await removeUserFromGroup({
      groupId: fixture.groupId,
      username: fixture.approver.username,
      authToken: adminToken
    });

    await expectLockedOut(fixture, pending, { message: NOT_ELIGIBLE, canOpenRequest: false });
  });

  test("an approver named only on a later step can't decide the step in progress", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver, otherId }) => [
        { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: otherId }] },
        { requiredApprovals: 1, approvers: [approver] }
      ]
    });
    const { certificateId, requestId } = await fixture.raiseRequest();

    await expectRefused(requestId, fixture.approver.token, { statusCode: 403, message: NOT_ELIGIBLE });
    expect((await getRevocationRequest({ requestId, authToken: fixture.approver.token })).canReview).toBe(false);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  test("an approver can't decide a request another approver already rejected", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const { certificateId, requestId } = await fixture.raiseRequest();

    await decideRevocationRequest({ requestId, decision: "reject", authToken: fixture.other.token });

    await expectRefused(requestId, fixture.approver.token, { statusCode: 400, message: "Request is not pending" });
    expect((await getRevocationRequest({ requestId, authToken: fixture.approver.token })).canReview).toBe(false);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  test.each(["approve", "reject"] as const)("an approver can't %s an expired request", async (decision) => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep, maxRequestTtl: "1h" });
    const { certificateId, requestId } = await fixture.raiseRequest();
    // Expiry is the passage of time, so the stored deadline is moved into the past rather than waiting an hour.
    await testDb(TableName.ApprovalRequests)
      .where({ id: requestId })
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    expect((await getRevocationRequest({ requestId, authToken: fixture.approver.token })).canReview).toBe(false);
    await decideRevocationRequest({ requestId, decision, authToken: fixture.approver.token }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json().message).toBe("Request has expired");
    });
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  test("an approver demoted to Auditor and restored to Operator can approve and reject again", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const requests = [await fixture.raiseRequest(), await fixture.raiseRequest(), await fixture.raiseRequest()];

    for (const role of [ResourceMembershipRole.Auditor, ResourceMembershipRole.Operator]) {
      // eslint-disable-next-line no-await-in-loop
      await updateApplicationMemberRole({
        applicationId: fixture.application.id,
        kind: "users",
        memberId: fixture.approver.userId,
        role,
        authToken: adminToken
      });
    }

    await expectCanStillDecide(fixture, requests);
  });

  test.each([
    {
      writer: "removed from the Application",
      apply: (applicationId: string, userId: string) =>
        removeApplicationMember({ applicationId, kind: "users", memberId: userId, authToken: adminToken })
    },
    {
      writer: "demoted to Auditor",
      apply: (applicationId: string, userId: string) =>
        updateApplicationMemberRole({
          applicationId,
          kind: "users",
          memberId: userId,
          role: ResourceMembershipRole.Auditor,
          authToken: adminToken
        })
    }
  ])("a new revocation is refused when the policy's only approver was $writer", async ({ apply }) => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver }) => [{ requiredApprovals: 1, approvers: [approver] }]
    });
    const certificateId = await fixture.issue();

    await apply(fixture.application.id, fixture.approver.userId);

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/cert-manager/certificates/${certificateId}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` },
      body: { revocationReason: "KEY_COMPROMISE" }
    });
    expect(res.statusCode, res.payload).toBe(400);
    expect(res.json().message).toBe(
      `Revocation approval policy '${fixture.policy.name}' has no approvers on step 1, so nobody could approve this request. Ask an Application Admin to add approvers to the policy.`
    );

    // No route lists approval requests by certificate, so the table is read to prove none was created.
    const requests = await testDb(TableName.ApprovalRequests).whereRaw(
      `"requestData"->'requestData'->>'certificateId' = ?`,
      [certificateId]
    );
    expect(requests).toHaveLength(0);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });
});
