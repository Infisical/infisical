import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";

import { createActiveCertManagerProject, createInternalRootCa } from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";

const DOMAIN = "deprecated-v3.example.com";

const authHeaders = (authToken: string) => ({ authorization: `Bearer ${authToken}` });

// The deprecated v3 routes create the certificate request already issued and then attach the certificate to it. They
// only accept a profile with its own (legacy) enrollment config, not one issued through an Application.
describe("Deprecated v3 certificate issuance", async () => {
  let restoreLicense: () => void;
  let authToken = "";
  let profileId = "";
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ maxCas: 100, maxInternalCas: 100 });
    ({ authToken, cleanup } = await createIsolatedOrgAndProject("deprecated-v3-issue"));
    const projectId = await createActiveCertManagerProject(authToken);
    const caId = await createInternalRootCa({ projectId, authToken });
    const policyRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/cert-manager/certificate-policies",
      headers: authHeaders(authToken),
      body: { projectId, name: "deprecated-v3-policy", subject: [{ type: "common_name", allowed: [`*.${DOMAIN}`] }] }
    });
    expect(policyRes.statusCode, policyRes.payload).toBe(200);
    const profileRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/cert-manager/certificate-profiles",
      headers: authHeaders(authToken),
      body: {
        projectId,
        caId,
        certificatePolicyId: policyRes.json<{ certificatePolicy: { id: string } }>().certificatePolicy.id,
        slug: "deprecated-v3-profile",
        enrollmentType: "api",
        apiConfig: { autoRenew: false }
      }
    });
    expect(profileRes.statusCode, profileRes.payload).toBe(200);
    profileId = profileRes.json<{ certificateProfile: { id: string } }>().certificateProfile.id;
  });

  afterAll(async () => {
    await cleanup?.();
    restoreLicense?.();
  });

  test("links the issued certificate to the request it returns", async () => {
    const issueRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/pki/certificates/issue-certificate",
      headers: authHeaders(authToken),
      body: {
        profileId,
        commonName: `api.${DOMAIN}`,
        ttl: "10d",
        keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
        signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA256
      }
    });
    expect(issueRes.statusCode, issueRes.payload).toBe(200);
    const issued = issueRes.json<{ certificateRequestId: string; serialNumber: string }>();

    const requestRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/cert-manager/certificates/certificate-requests/${issued.certificateRequestId}`,
      headers: authHeaders(authToken)
    });
    expect(requestRes.statusCode, requestRes.payload).toBe(200);
    const certificateRequest = requestRes.json<{ certificateId: string | null; certificate: string | null }>();

    expect(certificateRequest.certificateId, "the request names the certificate it issued").toBeTruthy();
    expect(certificateRequest.certificate, "fetching the request returns the certificate").toContain(
      "BEGIN CERTIFICATE"
    );
  });
});
