// A revocation request saves its approvers when it is raised, but whether a saved approver may still decide it is
// read live. Each test raises requests, then changes the approver's access through the route a user would, and
// checks what the approver can do and who hears about it.
//
// An approved revocation that fails tells the requester and the saved approvers who can still approve. Each test
// has its own CA, so deleting it (which deletes its certificates) between the request and its approval makes the
// approved revocation fail and send that notice.
import { ProjectMembershipRole, OrgMembershipRole, TableName } from "@app/db/schemas";
import { ResourceMembershipRole } from "@app/db/schemas/models";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestStepStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
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
  getRevocationApprovalPolicy,
  getRevocationRequest,
  issueApplicationCertificate,
  listApplicationRevocationRequests,
  listProjectRevocationRequests,
  removeApplicationMember,
  revokeCertificate,
  TRevocationPolicyStep,
  updateApplicationMemberRole,
  updateRevocationApprovalPolicy
} from "../../testUtils/cert-manager";
import { createEmptyOrg, createIsolatedOrgAndProject, deleteOrgs } from "../../testUtils/fixtures";
import { createProjectGroup, deleteGroups, removeUserFromGroup } from "../../testUtils/groups";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";
import { pollUntil, waitUntilBlockedBy } from "../../testUtils/poll";
import {
  addUserMembership,
  createUser,
  createUserAccessToken,
  deactivateOrgMembership,
  deleteUsers
} from "../../testUtils/users";

const COMMON_NAME = "revoke-me.example.com";
const NO_APPROVING_ROLE =
  "You can't review this request because you no longer have a role in its Application that can approve requests.";
const NOT_ELIGIBLE = "You are not an eligible approver for this step";

type TApprover = { userId: string; username: string; token: string; orgMembershipId: string };
type TApprovers = { approver: TApprover; other: TApprover };

describe("Revocation approval when a saved approver's access changes", { timeout: 60_000 }, () => {
  let restoreLicense: () => void;
  let cleanupOrg: () => Promise<void>;
  let adminToken = "";
  let orgId = "";
  let projectId = "";
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdOrgIds: string[] = [];

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
    await deleteOrgs(createdOrgIds);
    await deleteUsers(createdUserIds);
  });

  const createApprover = async (label: string): Promise<TApprover> => {
    const { userId, username } = await createUser(label);
    createdUserIds.push(userId);
    const orgMembershipId = await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.Member });
    return { userId, username, orgMembershipId, token: await createUserAccessToken({ userId, orgId }) };
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

    return { approver, other, application, profile, groupId, policy, issue, raiseRequest, deleteCa };
  };

  type TFixture = TApprovers & { deleteCa: () => Promise<void> };

  const oneStep = ({ approver, otherId }: { approver: { type: ApproverType; id: string }; otherId: string }) => [
    { requiredApprovals: 1, approvers: [approver, { type: ApproverType.User, id: otherId }] }
  ];

  // The certificate's status is read from the database because a refused decision has no response that shows it.
  const certificateStatus = async (certificateId: string) =>
    (await testDb(TableName.Certificate).where({ id: certificateId }).first<{ status: string }>())?.status;

  const expectRefused = async (
    requestId: string,
    token: string,
    expected: { statusCode: number; message?: string }
  ) => {
    for (const decision of ["approve", "reject"] as const) {
      // eslint-disable-next-line no-await-in-loop
      await decideRevocationRequest({ requestId, decision, authToken: token }).expect((res) => {
        expect(res.statusCode, `${decision}: ${res.payload}`).toBe(expected.statusCode);
        if (expected.message) expect(res.json().message, decision).toBe(expected.message);
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
      `Revocation approval policy '${fixture.policy.name}' has no approvers who can approve on step 1, so nobody could approve this request. Ask an Application Admin to add approvers with an Admin or Operator role to the policy.`
    );

    // No route lists approval requests by certificate, so the table is read to prove none was created.
    const requests = await testDb(TableName.ApprovalRequests).whereRaw(
      `"requestData"->'requestData'->>'certificateId' = ?`,
      [certificateId]
    );
    expect(requests).toHaveLength(0);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  // No route lists approval requests by certificate, so the table is read to prove none was created.
  const revocationRequestCount = async (certificateId: string) =>
    (
      await testDb(TableName.ApprovalRequests).whereRaw(`"requestData"->'requestData'->>'certificateId' = ?`, [
        certificateId
      ])
    ).length;

  test.each(["user", "group"] as const)(
    "a revocation policy can't be created or updated to name an Auditor %s approver",
    async (kind) => {
      const fixture = await setUp({ approverVia: "user", steps: oneStep });
      const auditor = await createApprover("auditor");
      let auditorEntry: { type: ApproverType; id: string };
      let auditorLabel: string;
      if (kind === "user") {
        await addApplicationUsers({
          applicationId: fixture.application.id,
          userIds: [auditor.userId],
          role: ResourceMembershipRole.Auditor,
          authToken: adminToken
        });
        auditorEntry = { type: ApproverType.User, id: auditor.userId };
        auditorLabel = "auditor";
      } else {
        const { id: groupId, name: groupName } = await createProjectGroup({
          orgId,
          projectId,
          userIds: [auditor.userId]
        });
        auditorLabel = groupName;
        createdGroupIds.push(groupId);
        await addApplicationGroup({
          applicationId: fixture.application.id,
          groupId,
          role: ResourceMembershipRole.Auditor,
          authToken: adminToken
        });
        auditorEntry = { type: ApproverType.Group, id: groupId };
      }

      // The same body naming an Operator is accepted, so the refusal below is about the Auditor.
      await createRevocationApprovalPolicy({
        applicationId: fixture.application.id,
        profileSlug: fixture.profile.slug,
        steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: fixture.other.userId }] }],
        authToken: adminToken
      });
      // Policies are counted in the table because a refused create returns nothing that shows none was saved.
      const policyCount = async () =>
        (await testDb(TableName.ApprovalPolicies).where({ scopeId: fixture.application.id })).length;
      const policiesBefore = await policyCount();

      const auditorRefusal = `Revocation approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: ${kind}s ${auditorLabel}.`;
      await createRevocationApprovalPolicy({
        applicationId: fixture.application.id,
        profileSlug: fixture.profile.slug,
        steps: [{ requiredApprovals: 1, approvers: [auditorEntry] }],
        authToken: adminToken
      }).expect((res) => {
        expect(res.statusCode, res.payload).toBe(400);
        expect(JSON.parse(res.payload).message).toBe(auditorRefusal);
      });
      expect(await policyCount()).toBe(policiesBefore);

      await updateRevocationApprovalPolicy({
        policyId: fixture.policy.id,
        steps: [{ requiredApprovals: 1, approvers: [auditorEntry] }],
        authToken: adminToken
      }).expect((res) => {
        expect(res.statusCode, res.payload).toBe(400);
        expect(JSON.parse(res.payload).message).toBe(auditorRefusal);
      });
      const { steps } = await getRevocationApprovalPolicy({ policyId: fixture.policy.id, authToken: adminToken });
      expect(steps).toHaveLength(1);
      expect(steps[0].approvers).toHaveLength(2);
      expect(steps[0].approvers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: ApproverType.User, id: fixture.approver.userId }),
          expect.objectContaining({ type: ApproverType.User, id: fixture.other.userId })
        ])
      );
    }
  );

  test("a refused approver outside the Application comes back only as the ID the caller sent, on create and update", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const outsider = await createUser("outsider-no-org");
    createdUserIds.push(outsider.userId);
    const foreignOrg = await createEmptyOrg({ namePrefix: "foreign-org" });
    createdOrgIds.push(foreignOrg.orgId);
    const foreignGroupName = `foreign-group-${crypto.randomUUID().slice(0, 8)}`;
    const [foreignGroup] = (await testDb(TableName.Groups)
      .insert({ orgId: foreignOrg.orgId, name: foreignGroupName, slug: foreignGroupName })
      .returning("id")) as { id: string }[];

    const approvers = [
      { type: ApproverType.User, id: outsider.userId },
      { type: ApproverType.Group, id: foreignGroup.id }
    ];
    const expectIdsOnly = (res: { statusCode: number; payload: string }) => {
      expect(res.statusCode, res.payload).toBe(400);
      const { message } = JSON.parse(res.payload);
      expect(message).toBe(
        `Revocation approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: users ${outsider.userId}; groups ${foreignGroup.id}.`
      );
      expect(message).not.toContain(outsider.username);
      expect(message).not.toContain(foreignGroupName);
    };

    await createRevocationApprovalPolicy({
      applicationId: fixture.application.id,
      profileSlug: fixture.profile.slug,
      steps: [{ requiredApprovals: 1, approvers }],
      authToken: adminToken
    }).expect(expectIdsOnly);
    await updateRevocationApprovalPolicy({
      policyId: fixture.policy.id,
      steps: [{ requiredApprovals: 1, approvers }],
      authToken: adminToken
    }).expect(expectIdsOnly);
  });

  test("a refused approver who belongs only to another Application comes back as the ID the caller sent", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const otherApplication = await setUp({ approverVia: "user", steps: oneStep });
    const elsewhere = await createApprover("auditor-elsewhere");
    await addApplicationUsers({
      applicationId: otherApplication.application.id,
      userIds: [elsewhere.userId],
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });

    await createRevocationApprovalPolicy({
      applicationId: fixture.application.id,
      profileSlug: fixture.profile.slug,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: elsewhere.userId }] }],
      authToken: adminToken
    }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(JSON.parse(res.payload).message).toBe(
        `Revocation approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: users ${elsewhere.userId}.`
      );
    });
  });

  test("a covered certificate can't be revoked once one of a 2-approval step's two approvers is demoted to Auditor", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver, otherId }) => [
        { requiredApprovals: 2, approvers: [approver, { type: ApproverType.User, id: otherId }] }
      ]
    });
    const certificateId = await fixture.issue();

    await updateApplicationMemberRole({
      applicationId: fixture.application.id,
      kind: "users",
      memberId: fixture.approver.userId,
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });

    await revokeCertificate({ certificateId, authToken: adminToken }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(JSON.parse(res.payload).message).toContain(
        "requires 2 approvals on step 1 but has only 1 approver who can approve,"
      );
    });
    expect(await revocationRequestCount(certificateId)).toBe(0);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  test.each([
    {
      writer: "removed from the Application",
      apply: (applicationId: string, groupId: string) =>
        removeApplicationMember({ applicationId, kind: "groups", memberId: groupId, authToken: adminToken })
    },
    {
      writer: "demoted to Auditor",
      apply: (applicationId: string, groupId: string) =>
        updateApplicationMemberRole({
          applicationId,
          kind: "groups",
          memberId: groupId,
          role: ResourceMembershipRole.Auditor,
          authToken: adminToken
        })
    }
  ])(
    "an approver named only through a group that was $writer can't decide, even with a direct Operator role",
    async ({ apply }) => {
      const fixture = await setUp({ approverVia: "group", steps: oneStep });
      await addApplicationUsers({
        applicationId: fixture.application.id,
        userIds: [fixture.approver.userId],
        role: ResourceMembershipRole.Operator,
        authToken: adminToken
      });
      const { certificateId, requestId } = await fixture.raiseRequest();

      await apply(fixture.application.id, fixture.groupId);

      await expectRefused(requestId, fixture.approver.token, {
        statusCode: 403,
        message:
          "You can't review this request because the group that names you as an approver no longer has a role in its Application that can approve requests."
      });
      expect((await getRevocationRequest({ requestId, authToken: fixture.approver.token })).canReview).toBe(false);
      expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
    }
  );

  test("an approver removed from the Application no longer sees the request in the project's request list", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const { requestId } = await fixture.raiseRequest();
    const listedIds = async () =>
      (await listProjectRevocationRequests({ projectId, authToken: fixture.approver.token })).map(({ id }) => id);
    expect(await listedIds()).toContain(requestId);

    await removeApplicationMember({
      applicationId: fixture.application.id,
      kind: "users",
      memberId: fixture.approver.userId,
      authToken: adminToken
    });

    expect(await listedIds()).not.toContain(requestId);
  });

  const noApproversRefusal = (policyName: string) =>
    `Revocation approval policy '${policyName}' has no approvers who can approve on step 1, so nobody could approve this request. Ask an Application Admin to add approvers with an Admin or Operator role to the policy.`;

  const demote = (applicationId: string, userId: string) =>
    updateApplicationMemberRole({
      applicationId,
      kind: "users",
      memberId: userId,
      role: ResourceMembershipRole.Auditor,
      authToken: adminToken
    });

  // The stuck request's approvers can't come back by themselves, so each case points the policy at `other` before
  // revoking again, and the replacement is checked to name `other` rather than the stuck request's approvers.
  const expectReplaced = async (
    fixture: { policy: { id: string }; other: TApprover },
    { certificateId, requestId }: { certificateId: string; requestId: string }
  ) => {
    await updateRevocationApprovalPolicy({
      policyId: fixture.policy.id,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: fixture.other.userId }] }],
      authToken: adminToken
    });

    const replacementId = await revokeCertificate({ certificateId, authToken: adminToken });
    expect(replacementId).not.toBe(requestId);

    expect((await getRevocationRequest({ requestId, authToken: adminToken })).status).toBe("cancelled");
    const replacement = await getRevocationRequest({ requestId: replacementId, authToken: fixture.other.token });
    expect(replacement.status).toBe("pending");
    expect(replacement.canReview).toBe(true);
    expect(replacement.steps.map((step) => step.approvers)).toEqual([
      [{ type: ApproverType.User, id: fixture.other.userId }]
    ]);
    expect(await revocationRequestCount(certificateId)).toBe(2);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  };

  // The Application list is what the certificate pages read to decide whether Revoke can replace the request.
  const replaceableFlags = async (applicationId: string, requestId: string) => {
    const listed = await listApplicationRevocationRequests({ applicationId, authToken: adminToken });
    const fetched = await getRevocationRequest({ requestId, authToken: adminToken });
    return {
      listed: listed.find(({ id }) => id === requestId)?.approversCanNoLongerApprove,
      fetched: fetched.approversCanNoLongerApprove
    };
  };

  test("a revocation request whose only approver was demoted to Auditor is replaced by the next revocation", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver }) => [{ requiredApprovals: 1, approvers: [approver] }]
    });
    const pending = await fixture.raiseRequest();
    expect(await replaceableFlags(fixture.application.id, pending.requestId)).toEqual({
      listed: false,
      fetched: false
    });

    await demote(fixture.application.id, fixture.approver.userId);

    expect(await replaceableFlags(fixture.application.id, pending.requestId)).toEqual({
      listed: true,
      fetched: true
    });
    await expectReplaced(fixture, pending);
  });

  test("a revocation request needing one more approval is replaced once its last approver who hasn't voted is demoted", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver, otherId }) => [
        { requiredApprovals: 2, approvers: [approver, { type: ApproverType.User, id: otherId }] }
      ]
    });
    const pending = await fixture.raiseRequest();
    const approved = await decideRevocationRequest({
      requestId: pending.requestId,
      decision: "approve",
      authToken: fixture.other.token
    });
    expect(approved.status).toBe("pending");

    await demote(fixture.application.id, fixture.approver.userId);

    await expectReplaced(fixture, pending);
  });

  test("a revocation request whose later step has nobody left who can approve is replaced by the next revocation", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver, otherId }) => [
        { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: otherId }] },
        { requiredApprovals: 1, approvers: [approver] }
      ]
    });
    const pending = await fixture.raiseRequest();

    await demote(fixture.application.id, fixture.approver.userId);

    await expectReplaced(fixture, pending);
  });

  test("a revocation request someone can still approve isn't replaced by the next revocation", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const { certificateId, requestId } = await fixture.raiseRequest();

    await demote(fixture.application.id, fixture.approver.userId);

    expect(await replaceableFlags(fixture.application.id, requestId)).toEqual({ listed: false, fetched: false });

    await revokeCertificate({ certificateId, authToken: adminToken }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json().message).toBe(`A revocation of certificate '${COMMON_NAME}' is already waiting for approval.`);
    });
    expect((await getRevocationRequest({ requestId, authToken: adminToken })).status).toBe("pending");
    expect(await revocationRequestCount(certificateId)).toBe(1);
  });

  // The transaction stands in for an approval in flight: it holds the request lock while it records step 1's vote and
  // moves the request to step 2, as approve does. Step 1's approver loses access before it commits, so a revocation
  // that read the request without that lock would see step 1 with nobody left to approve it and cancel a request
  // step 2 can still pass.
  test("a revocation waits for an approval in flight and doesn't replace the request it moved to a step that can still pass", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver, otherId }) => [
        { requiredApprovals: 1, approvers: [approver] },
        { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: otherId }] }
      ]
    });
    const { certificateId, requestId } = await fixture.raiseRequest();
    const [stepOne, stepTwo] = await testDb(TableName.ApprovalRequestSteps)
      .where({ requestId })
      .orderBy("stepNumber", "asc")
      .select("id");

    const approval = await testDb.transaction();
    let revocation: ReturnType<ReturnType<typeof revokeCertificate>["raw"]> | undefined;
    try {
      const { rows } = await approval.raw("select pg_backend_pid() as pid");
      await approval(TableName.ApprovalRequests).forUpdate().where({ id: requestId }).first();
      await approval(TableName.ApprovalRequestApprovals).insert({
        stepId: stepOne.id,
        approverUserId: fixture.approver.userId,
        decision: ApprovalRequestApprovalDecision.Approved
      });
      await approval(TableName.ApprovalRequestSteps)
        .where({ id: stepOne.id })
        .update({ status: ApprovalRequestStepStatus.Completed, completedAt: new Date() });
      await approval(TableName.ApprovalRequests).where({ id: requestId }).update({ currentStep: 2 });
      await approval(TableName.ApprovalRequestSteps)
        .where({ id: stepTwo.id })
        .update({ status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() });

      // The policy is repaired first, so the revocation gets past the policy check and reaches the pending request.
      await updateRevocationApprovalPolicy({
        policyId: fixture.policy.id,
        steps: [
          { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: fixture.other.userId }] },
          { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: fixture.other.userId }] }
        ],
        authToken: adminToken
      });
      await demote(fixture.application.id, fixture.approver.userId);

      revocation = revokeCertificate({ certificateId, authToken: adminToken }).raw();
      await waitUntilBlockedBy(rows[0].pid as number);
      await approval.commit();
    } finally {
      if (!approval.isCompleted()) await approval.rollback();
    }

    const res = await revocation;
    expect(res?.statusCode, res?.payload).toBe(400);
    expect(res?.json().message).toBe(`A revocation of certificate '${COMMON_NAME}' is already waiting for approval.`);
    expect((await getRevocationRequest({ requestId, authToken: adminToken })).status).toBe("pending");
    expect(await revocationRequestCount(certificateId)).toBe(1);
  });

  test("a new revocation is refused when the policy's only approver is an Operator group with no members", async () => {
    const fixture = await setUp({ approverVia: "user", steps: oneStep });
    const { id: emptyGroupId } = await createProjectGroup({ orgId, projectId, userIds: [] });
    createdGroupIds.push(emptyGroupId);
    await addApplicationGroup({
      applicationId: fixture.application.id,
      groupId: emptyGroupId,
      role: ResourceMembershipRole.Operator,
      authToken: adminToken
    });
    await updateRevocationApprovalPolicy({
      policyId: fixture.policy.id,
      steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.Group, id: emptyGroupId }] }],
      authToken: adminToken
    });
    const certificateId = await fixture.issue();

    await revokeCertificate({ certificateId, authToken: adminToken }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json().message).toBe(noApproversRefusal(fixture.policy.name));
    });
    expect(await revocationRequestCount(certificateId)).toBe(0);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });

  test("a new revocation is refused when the policy's only approver was deactivated in the organization", async () => {
    const fixture = await setUp({
      approverVia: "user",
      steps: ({ approver }) => [{ requiredApprovals: 1, approvers: [approver] }]
    });
    const certificateId = await fixture.issue();

    await deactivateOrgMembership({ orgId, membershipId: fixture.approver.orgMembershipId, authToken: adminToken });

    await revokeCertificate({ certificateId, authToken: adminToken }).expect((res) => {
      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json().message).toBe(noApproversRefusal(fixture.policy.name));
    });
    expect(await revocationRequestCount(certificateId)).toBe(0);
    expect(await certificateStatus(certificateId)).toBe(CertStatus.ACTIVE);
  });
});
