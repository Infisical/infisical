import { randomUUID } from "node:crypto";

import { LightMyRequestResponse } from "fastify";

import { ProjectType } from "@app/db/schemas";
import { ResourceMembershipRole } from "@app/db/schemas/models";
import { ApprovalPolicyScope, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm, CrlReason } from "@app/services/certificate/certificate-types";

import { request } from "./request";

const auth = (authToken: string) => ({ authorization: `Bearer ${authToken}` });

const ok = <T>(res: LightMyRequestResponse) => {
  expect(res.statusCode, res.payload).toBe(200);
  return res.json<T>();
};

// Org creation bootstraps a Certificate Manager project, but Applications only run on the org's active one, so a
// spec makes its own project active rather than relying on which one that is.
export const createActiveCertManagerProject = async (authToken: string) => {
  const { project } = await request(
    {
      method: "POST",
      url: "/api/v1/projects",
      headers: auth(authToken),
      body: { projectName: `cert-manager-${randomUUID().slice(0, 8)}`, type: ProjectType.CertificateManager }
    },
    ok<{ project: { id: string } }>
  );
  await request(
    {
      method: "POST",
      url: "/api/v1/cert-manager/instance/active-project",
      headers: auth(authToken),
      body: { projectId: project.id }
    },
    ok
  );
  return project.id;
};

export const createInternalRootCa = (dto: { projectId: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: "/api/v1/pki/ca/internal",
      headers: auth(dto.authToken),
      body: {
        projectId: dto.projectId,
        name: `root-ca-${randomUUID().slice(0, 8)}`,
        status: CaStatus.ACTIVE,
        enableDirectIssuance: true,
        configuration: {
          type: InternalCaType.ROOT,
          commonName: "E2E Root CA",
          keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
          notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    },
    (res) => ok<{ id: string }>(res).id
  );

// A certificate policy allowing `commonNames` and a profile issuing from `caId` under it.
export const createCertificateProfile = async (dto: {
  projectId: string;
  caId: string;
  commonNames: string[];
  authToken: string;
}) => {
  const suffix = randomUUID().slice(0, 8);
  const { certificatePolicy } = await request(
    {
      method: "POST",
      url: "/api/v1/cert-manager/certificate-policies",
      headers: auth(dto.authToken),
      body: {
        projectId: dto.projectId,
        name: `policy-${suffix}`,
        subject: [{ type: "common_name", allowed: dto.commonNames }]
      }
    },
    ok<{ certificatePolicy: { id: string } }>
  );
  const { certificateProfile } = await request(
    {
      method: "POST",
      url: "/api/v1/cert-manager/certificate-profiles",
      headers: auth(dto.authToken),
      body: {
        projectId: dto.projectId,
        caId: dto.caId,
        certificatePolicyId: certificatePolicy.id,
        slug: `profile-${suffix}`
      }
    },
    ok<{ certificateProfile: { id: string; slug: string } }>
  );
  return certificateProfile;
};

// The caller becomes the Application's Admin. API enrollment is enabled for `profileId` so certificates can be
// issued on it through the Application.
export const createApplicationWithApiProfile = async (dto: {
  projectId: string;
  profileId: string;
  authToken: string;
}) => {
  const { application } = await request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/applications?projectId=${dto.projectId}`,
      headers: auth(dto.authToken),
      body: { name: `app-${randomUUID().slice(0, 8)}`, profileIds: [dto.profileId] }
    },
    ok<{ application: { id: string; name: string } }>
  );
  await request(
    {
      method: "PUT",
      url: `/api/v1/cert-manager/applications/${application.id}/profiles/${dto.profileId}/enrollment/api`,
      headers: auth(dto.authToken),
      body: {}
    },
    ok
  );
  return application;
};

// Attaches another profile to an Application and enables API enrollment for it.
export const attachApiProfile = async (dto: { applicationId: string; profileId: string; authToken: string }) => {
  await request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/applications/${dto.applicationId}/profiles`,
      headers: auth(dto.authToken),
      body: { profileIds: [dto.profileId] }
    },
    ok
  );
  await request(
    {
      method: "PUT",
      url: `/api/v1/cert-manager/applications/${dto.applicationId}/profiles/${dto.profileId}/enrollment/api`,
      headers: auth(dto.authToken),
      body: {}
    },
    ok
  );
};

const applicationMemberUrl = (applicationId: string, kind: "users" | "groups" | "identities", memberId: string) =>
  `/api/v1/cert-manager/applications/${applicationId}/${kind}/${memberId}`;

export const addApplicationIdentity = (dto: {
  applicationId: string;
  identityId: string;
  role: ResourceMembershipRole;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: applicationMemberUrl(dto.applicationId, "identities", dto.identityId),
      headers: auth(dto.authToken),
      body: { role: dto.role }
    },
    ok
  );

export const addApplicationUsers = (dto: {
  applicationId: string;
  userIds: string[];
  role: ResourceMembershipRole;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/applications/${dto.applicationId}/users`,
      headers: auth(dto.authToken),
      body: { userIds: dto.userIds, role: dto.role }
    },
    ok
  );

export const addApplicationGroup = (dto: {
  applicationId: string;
  groupId: string;
  role: ResourceMembershipRole;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: applicationMemberUrl(dto.applicationId, "groups", dto.groupId),
      headers: auth(dto.authToken),
      body: { role: dto.role }
    },
    ok
  );

export const updateApplicationMemberRole = (dto: {
  applicationId: string;
  kind: "users" | "groups";
  memberId: string;
  role: ResourceMembershipRole;
  authToken: string;
}) =>
  request(
    {
      method: "PATCH",
      url: applicationMemberUrl(dto.applicationId, dto.kind, dto.memberId),
      headers: auth(dto.authToken),
      body: { role: dto.role }
    },
    ok
  );

export const removeApplicationMember = (dto: {
  applicationId: string;
  kind: "users" | "groups";
  memberId: string;
  authToken: string;
}) =>
  request(
    {
      method: "DELETE",
      url: applicationMemberUrl(dto.applicationId, dto.kind, dto.memberId),
      headers: auth(dto.authToken)
    },
    ok
  );

export const issueApplicationCertificate = (dto: {
  profileId: string;
  applicationId: string;
  commonName: string;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: "/api/v1/cert-manager/certificates",
      headers: auth(dto.authToken),
      body: {
        profileId: dto.profileId,
        applicationId: dto.applicationId,
        attributes: { commonName: dto.commonName, ttl: "1d" }
      }
    },
    (res) => ok<{ certificate: { certificateId: string } }>(res).certificate.certificateId
  );

export const revokeCertificate = (dto: { certificateId: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/certificates/${dto.certificateId}/revoke`,
      headers: auth(dto.authToken),
      body: { revocationReason: CrlReason.KEY_COMPROMISE }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(202);
      return res.json<{ approvalRequestId: string }>().approvalRequestId;
    }
  );

export type TRevocationPolicyStep = {
  requiredApprovals: number;
  approvers: { type: ApproverType; id: string }[];
  notifyApprovers?: boolean;
};

const revocationPoliciesUrl = "/api/v1/approval-policies/cert-revocation";

export const createRevocationApprovalPolicy = (dto: {
  applicationId: string;
  profileSlug: string;
  steps: TRevocationPolicyStep[];
  maxRequestTtl?: string;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: revocationPoliciesUrl,
      headers: auth(dto.authToken),
      body: {
        scope: ApprovalPolicyScope.PkiApplication,
        scopeId: dto.applicationId,
        name: `revocation-${randomUUID().slice(0, 8)}`,
        maxRequestTtl: dto.maxRequestTtl ?? null,
        conditions: [{ profileNames: [dto.profileSlug] }],
        steps: dto.steps
      }
    },
    (res) => ok<{ policy: { id: string; name: string } }>(res).policy
  );

export const updateRevocationApprovalPolicy = (dto: {
  policyId: string;
  steps: TRevocationPolicyStep[];
  authToken: string;
}) =>
  request(
    {
      method: "PATCH",
      url: `${revocationPoliciesUrl}/${dto.policyId}`,
      headers: auth(dto.authToken),
      body: { steps: dto.steps }
    },
    (res) => ok<{ policy: { id: string } }>(res).policy
  );

export const getRevocationApprovalPolicy = (dto: { policyId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `${revocationPoliciesUrl}/${dto.policyId}`,
      headers: auth(dto.authToken)
    },
    (res) => ok<{ policy: { id: string; steps: TRevocationPolicyStep[] } }>(res).policy
  );

// The query the Certificate Manager requests page and its sidebar count send.
export const listProjectRevocationRequests = (dto: { projectId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `${revocationPoliciesUrl}/requests`,
      headers: auth(dto.authToken),
      query: { scope: ApprovalPolicyScope.Project, id: dto.projectId }
    },
    (res) => ok<{ requests: { id: string }[] }>(res).requests
  );

export const listApplicationRevocationRequests = (dto: { applicationId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `${revocationPoliciesUrl}/requests`,
      headers: auth(dto.authToken),
      query: { scope: ApprovalPolicyScope.PkiApplication, id: dto.applicationId }
    },
    (res) => ok<{ requests: { id: string; approversCanNoLongerApprove: boolean }[] }>(res).requests
  );

export const cancelRevocationRequest = (dto: { requestId: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: `${revocationPoliciesUrl}/requests/${dto.requestId}/cancel`,
      headers: auth(dto.authToken)
    },
    (res) => ok<{ request: { id: string; status: string } }>(res).request
  );

export const getRevocationRequest = (dto: { requestId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `${revocationPoliciesUrl}/requests/${dto.requestId}`,
      headers: auth(dto.authToken)
    },
    (res) =>
      ok<{
        request: {
          id: string;
          status: string;
          canReview: boolean;
          approversCanNoLongerApprove: boolean;
          steps: { stepNumber: number; approvers: { type: ApproverType; id: string }[] }[];
        };
      }>(res).request
  );

export const decideRevocationRequest = (dto: {
  requestId: string;
  decision: "approve" | "reject";
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: `${revocationPoliciesUrl}/requests/${dto.requestId}/${dto.decision}`,
      headers: auth(dto.authToken),
      body: {}
    },
    (res) => ok<{ request: { id: string; status: string } }>(res).request
  );

export const detachApplicationProfile = (dto: { applicationId: string; profileId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/cert-manager/applications/${dto.applicationId}/profiles/${dto.profileId}`,
      headers: auth(dto.authToken)
    },
    ok
  );

export const deleteCertificateProfile = (dto: { profileId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/cert-manager/certificate-profiles/${dto.profileId}`,
      headers: auth(dto.authToken)
    },
    ok
  );

// Deleting a CA deletes the certificates it issued.
export const deleteInternalCa = (dto: { caId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/cert-manager/ca/internal/${dto.caId}`,
      headers: auth(dto.authToken)
    },
    ok
  );
