import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";

import { certificateAutoRenewalJob } from "e2e-test/fakes/certificate-v3-queue";

import { request } from "./request";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const authHeaders = (authToken: string) => ({ authorization: `Bearer ${authToken}` });

const post = async <T>(authToken: string, url: string, body: Record<string, unknown>) => {
  const res = await testServer.inject({ method: "POST", url, headers: authHeaders(authToken), body });
  expect(res.statusCode, res.payload).toBe(200);
  return res.json<T>();
};

export type TPkiApplication = {
  projectId: string;
  caId: string;
  profileId: string;
  profileSlug: string;
  applicationId: string;
};

// Builds the chain an Application issues through: a Certificate Manager project made active for the
// org, an internal root CA, a certificate policy allowing `*.<domain>`, a profile, and an Application
// using that profile. `authToken` must be scoped to the org (see createIsolatedOrgAndProject), and the
// plan needs maxCas / maxInternalCas (see overrideLicenseFeatures).
export const createPkiApplication = async (dto: { authToken: string; namePrefix: string; domain: string }) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `${dto.namePrefix}-${suffix}`;

  const { project } = await post<{ project: { id: string } }>(dto.authToken, "/api/v1/projects", {
    projectName: name,
    type: ProjectType.CertificateManager
  });
  const projectId = project.id;
  // Org creation already bootstraps a Certificate Manager project, and Applications only run on the active one.
  await post(dto.authToken, "/api/v1/cert-manager/instance/active-project", { projectId });

  const ca = await post<{ id: string }>(dto.authToken, "/api/v1/pki/ca/internal", {
    projectId,
    name: `${name}-ca`,
    status: CaStatus.ACTIVE,
    enableDirectIssuance: true,
    configuration: {
      type: InternalCaType.ROOT,
      commonName: `${name} Root CA`,
      keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
      notAfter: new Date(Date.now() + 365 * ONE_DAY_MS).toISOString()
    }
  });

  const { certificatePolicy } = await post<{ certificatePolicy: { id: string } }>(
    dto.authToken,
    "/api/v1/cert-manager/certificate-policies",
    { projectId, name: `${name}-policy`, subject: [{ type: "common_name", allowed: [`*.${dto.domain}`] }] }
  );

  const profileSlug = `${name}-profile`;
  const { certificateProfile } = await post<{ certificateProfile: { id: string } }>(
    dto.authToken,
    "/api/v1/cert-manager/certificate-profiles",
    { projectId, caId: ca.id, certificatePolicyId: certificatePolicy.id, slug: profileSlug }
  );

  const { application } = await post<{ application: { id: string } }>(
    dto.authToken,
    `/api/v1/cert-manager/applications?projectId=${projectId}`,
    { name: `${name}-application`, profileIds: [certificateProfile.id] }
  );

  const apiEnrollmentRes = await testServer.inject({
    method: "PUT",
    url: `/api/v1/cert-manager/applications/${application.id}/profiles/${certificateProfile.id}/enrollment/api?projectId=${projectId}`,
    headers: authHeaders(dto.authToken),
    body: { autoRenew: false }
  });
  expect(apiEnrollmentRes.statusCode, apiEnrollmentRes.payload).toBe(200);

  return {
    projectId,
    caId: ca.id,
    profileId: certificateProfile.id,
    profileSlug,
    applicationId: application.id
  } satisfies TPkiApplication;
};

// The user must already be a member of the project (see addUserMembership in users.ts).
export const addApplicationUser = (dto: { authToken: string; app: TPkiApplication; userId: string; role: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/applications/${dto.app.applicationId}/users?projectId=${dto.app.projectId}`,
      headers: authHeaders(dto.authToken),
      body: { userIds: [dto.userId], role: dto.role }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      expect(res.json<{ memberships: unknown[] }>().memberships, "the user joined the Application").toHaveLength(1);
    }
  );

type TIssuanceResponse = {
  certificate: { certificateId: string; serialNumber: string } | null;
  certificateRequestId: string;
  status?: string;
};

export const issueCertificate = (dto: { authToken: string; app: TPkiApplication; commonName: string; ttl: string }) =>
  request(
    {
      method: "POST",
      url: "/api/v1/cert-manager/certificates",
      headers: authHeaders(dto.authToken),
      body: {
        profileId: dto.app.profileId,
        applicationId: dto.app.applicationId,
        attributes: {
          commonName: dto.commonName,
          ttl: dto.ttl,
          keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
          signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA256
        }
      }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<TIssuanceResponse>();
    }
  );

export type TCertificate = {
  id: string;
  status: string;
  serialNumber: string;
  commonName: string;
  renewedByCertificateId?: string | null;
  renewBeforeDays?: number | null;
  renewalError?: string | null;
  revokedAt?: string | null;
};

export const getCertificate = (dto: { authToken: string; certificateId: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/cert-manager/certificates/${dto.certificateId}`,
      headers: authHeaders(dto.authToken)
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ certificate: TCertificate }>().certificate;
    }
  );

export type TRenewalResponse = {
  status: string;
  certificateId: string;
  certificateRequestId: string;
  serialNumber: string;
  certificate: string;
};

export const renewCertificate = (dto: { authToken: string; certificateId: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/cert-manager/certificates/${dto.certificateId}/renew`,
      headers: authHeaders(dto.authToken),
      body: {}
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<TRenewalResponse>();
    }
  );

export const setCertificateRenewBeforeDays = (dto: {
  authToken: string;
  certificateId: string;
  renewBeforeDays: number;
}) =>
  request(
    {
      method: "PATCH",
      url: `/api/v1/cert-manager/certificates/${dto.certificateId}/config`,
      headers: authHeaders(dto.authToken),
      body: { renewBeforeDays: dto.renewBeforeDays }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
    }
  );

// Runs the daily certificate auto-renewal job now, over every eligible certificate on the server.
export const runCertificateAutoRenewal = () => certificateAutoRenewalJob.run();
