// Walks a revocation request through its whole lifecycle once per actor: naming them as an approver, raising
// requests, seeing them, deciding, cancelling, acting after a decision, and the notices they receive.
//
// The expectations come from the product docs (pki/concepts/access-control.mdx, pki/applications/approvals.mdx) and
// the PR's description, not from the code. Where they say nothing, the cell expects the safe outcome: denied.
//
// The suite stops at the first failing test, so the matrix is one test that records every cell and fails once at the
// end with the list of cells that disagree with the expectations. The actors run one at a time because they share one
// Application and policy, so awaiting inside loops is the point.
/* eslint-disable no-await-in-loop */
import { LightMyRequestResponse } from "fastify";

import { OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { ResourceMembershipRole } from "@app/db/schemas/models";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { NotificationType } from "@app/services/notification/notification-types";

import {
  addApplicationGroup,
  addApplicationIdentity,
  addApplicationUsers,
  attachApiProfile,
  cancelRevocationRequest,
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
  revokeCertificate,
  updateRevocationApprovalPolicy
} from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createProjectGroup, deleteGroups } from "../../testUtils/groups";
import { addIdentityProjectMembership, createIdentityActor } from "../../testUtils/identities";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";
import { pollUntil } from "../../testUtils/poll";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const COMMON_NAME = "lifecycle.example.com";

type TExpectation = {
  // Stage 1: an Application Admin can save a revocation policy step that names this actor.
  nameable: boolean;
  // Stage 2.
  revokeCovered: 202 | 403;
  revokeUncovered: 200 | 403;
  // Stage 3: sees the request they look at (their own when they raise requests, otherwise one an Admin raised).
  sees: boolean;
  // Named on the policy's step: can review, approve and reject; gets the request and failure notices.
  named: boolean;
  // Raises requests of their own, so the request they look at and cancel is theirs.
  raises: boolean;
};

type TActor = TExpectation & {
  label: string;
  token: string;
  userId?: string;
  // How a policy step names this actor. A machine identity is offered as a user entry, the only way to try.
  entry: { type: ApproverType; id: string };
};

// The oracle, one row per actor. See the report for the sources of each cell. Two cells rest on product decisions the
// docs don't state:
// - product decision: Application members read their Application's requests, so an unnamed Operator and an Auditor
//   see them (canReview stays false).
// - product decision: an approver named on the policy gets the request notice, even for a request they raised.
const ORACLE: Record<string, TExpectation> = {
  "requester (Application Admin)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 200,
    sees: true,
    named: false,
    raises: true
  },
  "requester (Operator)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: false,
    raises: true
  },
  "named approver (Operator, direct)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: true,
    raises: false
  },
  "named approver (Admin)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 200,
    sees: true,
    named: true,
    raises: false
  },
  "named approver (through a group)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: true,
    raises: false
  },
  "Operator not named": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: false,
    raises: false
  },
  Auditor: { nameable: false, revokeCovered: 403, revokeUncovered: 403, sees: true, named: false, raises: false },
  "Product Admin not in the Application": {
    nameable: false,
    revokeCovered: 403,
    revokeUncovered: 403,
    sees: false,
    named: false,
    raises: false
  },
  "Product Member not in the Application": {
    nameable: false,
    revokeCovered: 403,
    revokeUncovered: 403,
    sees: false,
    named: false,
    raises: false
  },
  "org member without Certificate Management": {
    nameable: false,
    revokeCovered: 403,
    revokeUncovered: 403,
    sees: false,
    named: false,
    raises: false
  },
  "machine identity (Operator)": {
    nameable: false,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: false,
    raises: true
  },
  "requester named as approver (self-approval)": {
    nameable: true,
    revokeCovered: 202,
    revokeUncovered: 403,
    sees: true,
    named: true,
    raises: true
  }
};

describe("Certificate revocation lifecycle per actor", () => {
  let restoreLicense: () => void;
  let cleanupOrg: () => Promise<void>;
  let adminToken = "";
  let orgId = "";
  let projectId = "";
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ pkiApprovals: true, groups: true, maxCas: 100, maxInternalCas: 100 });
    const isolated = await createIsolatedOrgAndProject("cert-revocation-lifecycle");
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

  test("every actor's revocation lifecycle matches the documented access model", { timeout: 600_000 }, async () => {
    const findings: string[] = [];
    const check = (cell: string, expected: unknown, actual: unknown) => {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        findings.push(`${cell}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    };
    const refusedOrStatus = (res: LightMyRequestResponse) =>
      res.statusCode === 400 || res.statusCode === 403 ? "refused" : res.statusCode;

    // The certificate's and the request's status are read from the database: a refused call returns nothing that
    // shows them, and not every actor can read the request.
    const certStatus = async (certificateId: string) =>
      (await testDb(TableName.Certificate).where({ id: certificateId }).first<{ status: string }>())?.status;
    const requestStatus = async (requestId: string) =>
      (await testDb(TableName.ApprovalRequests).where({ id: requestId }).first<{ status: string }>())?.status;

    // World: one CA; a covered profile (the policy lists it), an uncovered one, and one only the stage-1 policies use.
    const caId = await createInternalRootCa({ projectId, authToken: adminToken });
    const newProfile = () =>
      createCertificateProfile({ projectId, caId, commonNames: [COMMON_NAME], authToken: adminToken });
    const covered = await newProfile();
    const uncovered = await newProfile();
    const configOnly = await newProfile();
    const application = await createApplicationWithApiProfile({
      projectId,
      profileId: covered.id,
      authToken: adminToken
    });
    for (const profile of [uncovered, configOnly]) {
      await attachApiProfile({ applicationId: application.id, profileId: profile.id, authToken: adminToken });
    }

    const newUser = async (label: string, projectRole: ProjectMembershipRole | null) => {
      const { userId } = await createUser(label);
      createdUserIds.push(userId);
      await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
      if (projectRole) await addUserMembership({ userId, orgId, projectId, role: projectRole });
      return { userId, token: await createUserAccessToken({ userId, orgId }) };
    };
    const addToApplication = (userId: string, role: ResourceMembershipRole) =>
      addApplicationUsers({ applicationId: application.id, userIds: [userId], role, authToken: adminToken });

    const actors: TActor[] = [];
    const addUserActor = async (
      label: string,
      projectRole: ProjectMembershipRole | null,
      applicationRole: ResourceMembershipRole | null
    ) => {
      const user = await newUser(label.replace(/\W+/g, "-").slice(0, 30), projectRole);
      if (applicationRole) await addToApplication(user.userId, applicationRole);
      const actor: TActor = {
        ...ORACLE[label],
        label,
        token: user.token,
        userId: user.userId,
        entry: { type: ApproverType.User, id: user.userId }
      };
      actors.push(actor);
      return actor;
    };

    const requesterAdmin = await addUserActor(
      "requester (Application Admin)",
      ProjectMembershipRole.Member,
      ResourceMembershipRole.Admin
    );
    await addUserActor("requester (Operator)", ProjectMembershipRole.Member, ResourceMembershipRole.Operator);
    const approverOperator = await addUserActor(
      "named approver (Operator, direct)",
      ProjectMembershipRole.Member,
      ResourceMembershipRole.Operator
    );
    const approverAdmin = await addUserActor(
      "named approver (Admin)",
      ProjectMembershipRole.Member,
      ResourceMembershipRole.Admin
    );
    const approverViaGroup = await addUserActor("named approver (through a group)", ProjectMembershipRole.Member, null);
    const { id: groupId } = await createProjectGroup({ orgId, projectId, userIds: [approverViaGroup.userId!] });
    createdGroupIds.push(groupId);
    await addApplicationGroup({
      applicationId: application.id,
      groupId,
      role: ResourceMembershipRole.Operator,
      authToken: adminToken
    });
    approverViaGroup.entry = { type: ApproverType.Group, id: groupId };
    await addUserActor("Operator not named", ProjectMembershipRole.Member, ResourceMembershipRole.Operator);
    await addUserActor("Auditor", ProjectMembershipRole.Member, ResourceMembershipRole.Auditor);
    await addUserActor("Product Admin not in the Application", ProjectMembershipRole.Admin, null);
    await addUserActor("Product Member not in the Application", ProjectMembershipRole.Member, null);
    await addUserActor("org member without Certificate Management", null, null);

    const identity = await createIdentityActor({ orgId, authToken: adminToken });
    await addIdentityProjectMembership({ identityId: identity.identityId, orgId, projectId });
    await addApplicationIdentity({
      applicationId: application.id,
      identityId: identity.identityId,
      role: ResourceMembershipRole.Operator,
      authToken: adminToken
    });
    actors.push({
      ...ORACLE["machine identity (Operator)"],
      label: "machine identity (Operator)",
      token: identity.authToken,
      entry: { type: ApproverType.User, id: identity.identityId }
    });

    const selfApprover = await addUserActor(
      "requester named as approver (self-approval)",
      ProjectMembershipRole.Member,
      ResourceMembershipRole.Operator
    );

    const namedEntries = [approverOperator, approverAdmin, approverViaGroup, selfApprover].map((a) => a.entry);
    await createRevocationApprovalPolicy({
      applicationId: application.id,
      profileSlug: covered.slug,
      steps: [{ requiredApprovals: 1, approvers: namedEntries, notifyApprovers: true }],
      authToken: adminToken
    });
    const configPolicy = await createRevocationApprovalPolicy({
      applicationId: application.id,
      profileSlug: configOnly.slug,
      steps: [{ requiredApprovals: 1, approvers: [approverOperator.entry] }],
      authToken: adminToken
    });

    const issue = (profileId: string) =>
      issueApplicationCertificate({
        profileId,
        applicationId: application.id,
        commonName: COMMON_NAME,
        authToken: adminToken
      });
    const revoke = (certificateId: string, token: string) =>
      revokeCertificate({ certificateId, authToken: token }).raw();
    // A request raised by `token`, on a fresh covered certificate.
    const raiseAs = async (token: string) => {
      const certificateId = await issue(covered.id);
      const res = await revoke(certificateId, token);
      if (res.statusCode !== 202) throw new Error(`raising a request failed: ${res.statusCode} ${res.payload}`);
      return { certificateId, requestId: res.json().approvalRequestId as string };
    };
    const policyCount = async () =>
      (await testDb(TableName.ApprovalPolicies).where({ scopeId: application.id })).length;

    for (const actor of actors) {
      const cell = (stage: string) => `${actor.label} | ${stage}`;
      const { token } = actor;
      try {
        // Stage 1: an Application Admin saves a policy step that names this actor, then edits one to name them.
        const policiesBefore = await policyCount();
        const created = await createRevocationApprovalPolicy({
          applicationId: application.id,
          profileSlug: configOnly.slug,
          steps: [{ requiredApprovals: 1, approvers: [actor.entry] }],
          authToken: adminToken
        }).raw();
        check(cell("1 create policy naming them"), actor.nameable ? 200 : 400, created.statusCode);
        check(
          cell("1 policies saved by that create"),
          actor.nameable ? policiesBefore + 1 : policiesBefore,
          await policyCount()
        );
        const updated = await updateRevocationApprovalPolicy({
          policyId: configPolicy.id,
          steps: [{ requiredApprovals: 1, approvers: [actor.entry] }],
          authToken: adminToken
        }).raw();
        check(cell("1 update policy to name them"), actor.nameable ? 200 : 400, updated.statusCode);
        const { steps } = await getRevocationApprovalPolicy({ policyId: configPolicy.id, authToken: adminToken });
        check(
          cell("1 policy names them after the update"),
          actor.nameable,
          steps[0].approvers.some((a) => a.id === actor.entry.id)
        );

        // Stage 2: revoke a covered certificate (raise a request) and an uncovered one (revoke directly).
        const coveredCert = await issue(covered.id);
        const coveredRes = await revoke(coveredCert, token);
        check(cell("2 revoke covered cert"), actor.revokeCovered, coveredRes.statusCode);
        check(cell("2 covered cert after revoke"), CertStatus.ACTIVE, await certStatus(coveredCert));
        const uncoveredCert = await issue(uncovered.id);
        const uncoveredRes = await revoke(uncoveredCert, token);
        check(cell("2 revoke uncovered cert"), actor.revokeUncovered, uncoveredRes.statusCode);
        if (actor.revokeCovered === 202 && actor.revokeUncovered === 403) {
          check(
            cell("2 uncovered refusal tells them to ask an Application Admin"),
            true,
            String(uncoveredRes.json().message).includes("Ask an Application Admin")
          );
        }
        check(
          cell("2 uncovered cert after revoke"),
          actor.revokeUncovered === 200 ? CertStatus.REVOKED : CertStatus.ACTIVE,
          await certStatus(uncoveredCert)
        );

        // The requests the actor looks at: their own if they raise requests, otherwise ones an Admin raised.
        const raiser = actor.raises ? token : requesterAdmin.token;
        const toApprove = await raiseAs(raiser);
        const toReject = await raiseAs(raiser);
        const toCancel = await raiseAs(raiser);

        // Stage 3: see it.
        const appList = await listApplicationRevocationRequests({
          applicationId: application.id,
          authToken: token
        }).raw();
        check(
          cell("3 Application-scope list shows it"),
          actor.sees,
          appList.statusCode === 200 &&
            (appList.json().requests as { id: string }[]).some((r) => r.id === toApprove.requestId)
        );
        const projectList = await listProjectRevocationRequests({ projectId, authToken: token }).raw();
        check(
          cell("3 Project-scope list (and nav pending count) shows it pending"),
          actor.sees,
          projectList.statusCode === 200 &&
            (projectList.json().requests as { id: string; status: string }[]).some(
              (r) => r.id === toApprove.requestId && r.status === "pending"
            )
        );
        const detail = await getRevocationRequest({ requestId: toApprove.requestId, authToken: token }).raw();
        check(cell("3 GET detail status"), actor.sees ? 200 : 403, detail.statusCode);
        if (detail.statusCode === 200) {
          check(cell("3 GET detail canReview"), actor.named, detail.json().request.canReview);
        }

        // Stage 4: decide.
        const approveRes = await decideRevocationRequest({
          requestId: toApprove.requestId,
          decision: "approve",
          authToken: token
        }).raw();
        check(cell("4 approve"), actor.named ? 200 : 403, approveRes.statusCode);
        check(
          cell("4 cert after approve"),
          actor.named ? CertStatus.REVOKED : CertStatus.ACTIVE,
          await certStatus(toApprove.certificateId)
        );
        check(
          cell("4 request after approve"),
          actor.named ? "approved" : "pending",
          await requestStatus(toApprove.requestId)
        );
        const rejectRes = await decideRevocationRequest({
          requestId: toReject.requestId,
          decision: "reject",
          authToken: token
        }).raw();
        check(cell("4 reject"), actor.named ? 200 : 403, rejectRes.statusCode);
        check(cell("4 cert after reject"), CertStatus.ACTIVE, await certStatus(toReject.certificateId));
        check(
          cell("4 request after reject"),
          actor.named ? "rejected" : "pending",
          await requestStatus(toReject.requestId)
        );

        // Stage 5: cancel.
        const cancelRes = await cancelRevocationRequest({ requestId: toCancel.requestId, authToken: token }).raw();
        check(cell("5 cancel"), actor.raises ? 200 : 403, cancelRes.statusCode);
        check(
          cell("5 request after cancel"),
          actor.raises ? "cancelled" : "pending",
          await requestStatus(toCancel.requestId)
        );
        check(cell("5 cert after cancel"), CertStatus.ACTIVE, await certStatus(toCancel.certificateId));

        // Stage 6: after a decision. Requests the actor couldn't decide are decided by a named approver first.
        if ((await requestStatus(toApprove.requestId)) === "pending") {
          await decideRevocationRequest({
            requestId: toApprove.requestId,
            decision: "approve",
            authToken: approverOperator.token
          });
        }
        if ((await requestStatus(toReject.requestId)) === "pending") {
          await decideRevocationRequest({
            requestId: toReject.requestId,
            decision: "reject",
            authToken: approverOperator.token
          });
        }
        for (const decision of ["approve", "reject"] as const) {
          for (const decided of [toApprove, toReject]) {
            const again = await decideRevocationRequest({
              requestId: decided.requestId,
              decision,
              authToken: token
            }).raw();
            const label = decided === toApprove ? "approved" : "rejected";
            check(cell(`6 ${decision} the ${label} request again`), "refused", refusedOrStatus(again));
            check(cell(`6 ${label} request after ${decision} again`), label, await requestStatus(decided.requestId));
          }
        }
        const canRevokeAtAll = actor.revokeCovered === 202 || actor.revokeUncovered === 200;
        const revokeRevoked = await revoke(toApprove.certificateId, token);
        check(cell("6 revoke the revoked cert again"), canRevokeAtAll ? 400 : 403, revokeRevoked.statusCode);
        check(cell("6 revoked cert after revoke again"), CertStatus.REVOKED, await certStatus(toApprove.certificateId));
        const revokeRejected = await revoke(toReject.certificateId, token);
        check(cell("6 revoke the rejected cert again"), actor.revokeCovered, revokeRejected.statusCode);
        check(cell("6 rejected cert after revoke again"), CertStatus.ACTIVE, await certStatus(toReject.certificateId));
      } catch (error) {
        findings.push(`${actor.label} | threw: ${(error as Error).message}`);
      }
    }

    // Stage 7: notifications. Machine identities have no inbox, so only users are checked.
    const userActors = actors.filter((a) => a.userId);
    const noticesFor = async (actor: TActor, type: NotificationType, requestId: string) =>
      (await listUserNotifications(actor.token)).filter(
        (n) => n.type === type && n.link?.includes(`/approvals/${requestId}`)
      ).length > 0;

    try {
      const notified = await raiseAs(requesterAdmin.token);
      await pollUntil({
        describe: "the request notice to a named approver",
        read: () => noticesFor(approverOperator, NotificationType.APPROVAL_REQUIRED, notified.requestId),
        done: Boolean
      });
      for (const actor of userActors) {
        check(
          `${actor.label} | 7 request notice for an Admin's request`,
          actor.named,
          await noticesFor(actor, NotificationType.APPROVAL_REQUIRED, notified.requestId)
        );
      }

      const own = await raiseAs(selfApprover.token);
      await pollUntil({
        describe: "the request notice for the self-approver's request",
        read: () => noticesFor(approverOperator, NotificationType.APPROVAL_REQUIRED, own.requestId),
        done: Boolean
      });
      check(
        `${selfApprover.label} | 7 request notice for their own request`,
        true,
        await noticesFor(selfApprover, NotificationType.APPROVAL_REQUIRED, own.requestId)
      );

      // Deleting the CA deletes its certificates, so the approval that follows fails and sends the failure notice.
      // A CA can't be deleted while a profile uses it, nor a profile while an Application has it attached.
      for (const profile of [covered, uncovered, configOnly]) {
        await detachApplicationProfile({ applicationId: application.id, profileId: profile.id, authToken: adminToken });
        await deleteCertificateProfile({ profileId: profile.id, authToken: adminToken });
      }
      await deleteInternalCa({ caId, authToken: adminToken });
      await decideRevocationRequest({
        requestId: notified.requestId,
        decision: "approve",
        authToken: approverOperator.token
      });
      await pollUntil({
        describe: "the failure notice to the requester",
        read: () => noticesFor(requesterAdmin, NotificationType.APPROVED_ACTION_FAILED, notified.requestId),
        done: Boolean
      });
      for (const actor of userActors) {
        check(
          `${actor.label} | 7 failure notice`,
          actor.named || actor === requesterAdmin,
          await noticesFor(actor, NotificationType.APPROVED_ACTION_FAILED, notified.requestId)
        );
      }
    } catch (error) {
      findings.push(`notifications | threw: ${(error as Error).message}`);
    }

    expect(findings).toEqual([]);
  });
});
