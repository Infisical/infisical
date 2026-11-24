import * as x509 from "@peculiar/x509";
import { Certificate, ContentInfo, SignedData } from "pkijs";

import { ProjectType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApproverType,
  CertRequestPolicyOperation
} from "@app/services/approval-policy/approval-policy-enums";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { getSerialNumberSpellings } from "@app/services/certificate/certificate-fns";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import {
  createApprovalPolicy,
  decideApprovalRequest,
  getCertificate,
  listApplicationApprovalRequests
} from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";

const PASSPHRASE = "est-passphrase-123";
const COMMON_NAME = "device.example.com";

const basicAuth = (passphrase: string) => `Basic ${Buffer.from(`device:${passphrase}`).toString("base64")}`;

const generateCsr = async () => {
  const signingAlgorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const keys = (await crypto.subtle.generateKey(signingAlgorithm, true, ["sign", "verify"])) as CryptoKeyPair;
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${COMMON_NAME}`,
    keys,
    signingAlgorithm
  });
  return csr.toString("pem");
};

const leafCertificateFromPkcs7 = (base64Pkcs7: string) => {
  const contentInfo = ContentInfo.fromBER(Buffer.from(base64Pkcs7.replace(/\s/g, ""), "base64"));
  const signedData = new SignedData({ schema: contentInfo.content });
  const [leaf] = (signedData.certificates ?? []) as Certificate[];
  return new x509.X509Certificate(leaf.toSchema().toBER(false));
};

describe("EST enrollment through an application profile", async () => {
  let authToken = "";
  let cleanup: () => Promise<void>;
  let restoreLicense: () => void;
  let estBaseUrl = "";
  let applicationId = "";
  let profileSlug = "";

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await testServer.inject({
      method: "POST",
      url: path,
      headers: { authorization: `Bearer ${authToken}` },
      body
    });
    expect(res.statusCode, res.payload).toBe(200);
    return res.json();
  };

  const enroll = async (
    operation: "simpleenroll" | "simplereenroll",
    { passphrase = PASSPHRASE, clientCert }: { passphrase?: string; clientCert?: string } = {}
  ) =>
    testServer.inject({
      method: "POST",
      url: `${estBaseUrl}/${operation}`,
      headers: {
        authorization: basicAuth(passphrase),
        "content-type": "application/pkcs10",
        ...(clientCert && { "x-ssl-client-cert": encodeURIComponent(clientCert) })
      },
      payload: await generateCsr()
    });

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ pkiEst: true, pkiApprovals: true, maxCas: 100, maxInternalCas: 100 });
    ({ authToken, cleanup } = await createIsolatedOrgAndProject("est-application"));

    const { project } = await post("/api/v1/projects", {
      projectName: "EST application enrollment",
      type: ProjectType.CertificateManager
    });
    const projectId = project.id as string;
    // Org creation already bootstraps a Certificate Manager project, and Applications only run on the active one.
    await post("/api/v1/cert-manager/instance/active-project", { projectId });

    const ca = await post("/api/v1/pki/ca/internal", {
      projectId,
      name: "est-root-ca",
      status: CaStatus.ACTIVE,
      enableDirectIssuance: true,
      configuration: {
        type: InternalCaType.ROOT,
        commonName: "EST Root CA",
        keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const { certificatePolicy } = await post("/api/v1/cert-manager/certificate-policies", {
      projectId,
      name: "est-policy",
      subject: [{ type: "common_name", allowed: [COMMON_NAME] }]
    });

    const { certificateProfile } = await post("/api/v1/cert-manager/certificate-profiles", {
      projectId,
      caId: ca.id,
      certificatePolicyId: certificatePolicy.id,
      slug: "est-profile"
    });

    const { application } = await post(`/api/v1/cert-manager/applications?projectId=${projectId}`, {
      name: "est-application",
      profileIds: [certificateProfile.id]
    });

    const estRes = await testServer.inject({
      method: "PUT",
      url: `/api/v1/cert-manager/applications/${application.id}/profiles/${certificateProfile.id}/enrollment/est?projectId=${projectId}`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { passphrase: PASSPHRASE, disableBootstrapCaValidation: true }
    });
    expect(estRes.statusCode, estRes.payload).toBe(200);

    estBaseUrl = `/.well-known/est/applications/${application.id}/profiles/${certificateProfile.id}`;
    applicationId = application.id;
    profileSlug = certificateProfile.slug;
  });

  afterAll(async () => {
    restoreLicense?.();
    await cleanup?.();
  });

  const enrolled = async () => {
    const res = await enroll("simpleenroll");
    expect(res.statusCode, res.payload).toBe(200);
    return leafCertificateFromPkcs7(res.payload);
  };

  const reenrolled = async (clientCert: x509.X509Certificate) => {
    const res = await enroll("simplereenroll", { clientCert: clientCert.toString("pem") });
    expect(res.statusCode, res.payload).toBe(200);
    return leafCertificateFromPkcs7(res.payload);
  };

  const stored = async (cert: x509.X509Certificate) => {
    const row = await testDb(TableName.Certificate)
      .whereIn("serialNumber", getSerialNumberSpellings(cert.serialNumber))
      .first();
    expect(row, `certificate ${cert.serialNumber} is in the inventory`).toBeTruthy();
    return getCertificate({ authToken, certificateId: row!.id as string });
  };

  test("issues a certificate on simpleenroll and renews it on simplereenroll", async () => {
    const enrollRes = await enroll("simpleenroll");

    expect(enrollRes.statusCode, enrollRes.payload).toBe(200);
    expect(enrollRes.headers["content-type"]).toContain("application/pkcs7-mime");
    const issued = leafCertificateFromPkcs7(enrollRes.payload);
    expect(issued.subject).toBe(`CN=${COMMON_NAME}`);

    const renewed = await reenrolled(issued);
    expect(renewed.subject).toBe(`CN=${COMMON_NAME}`);
    expect(renewed.serialNumber).not.toBe(issued.serialNumber);

    const [original, replacement] = [await stored(issued), await stored(renewed)];
    expect(original.renewedByCertificateId, "the old certificate points to its replacement").toBe(replacement.id);
    expect(replacement.renewedFromCertificateId, "the new certificate points back to the old one").toBe(original.id);
  });

  test("still issues when a client re-enrolls again with a certificate that was already renewed", async () => {
    const issued = await enrolled();
    const firstRenewal = await reenrolled(issued);

    const secondRenewal = await reenrolled(issued);

    expect(secondRenewal.serialNumber, "the second re-enrollment issues a new certificate").not.toBe(
      firstRenewal.serialNumber
    );
    const original = await stored(issued);
    expect(original.renewedByCertificateId, "the old certificate keeps pointing to the first replacement").toBe(
      (await stored(firstRenewal)).id
    );
    expect(
      (await stored(secondRenewal)).renewedFromCertificateId ?? null,
      "the second replacement isn't linked"
    ).toBeNull();
  });

  test("rejects a wrong passphrase", async () => {
    const res = await enroll("simpleenroll", { passphrase: "not-the-passphrase" });

    expect(res.statusCode, res.payload).toBe(401);
  });

  // Runs last: the policy it creates covers every later re-enrollment on this profile.
  describe("with a Renewal approval policy on the profile", async () => {
    let issued: x509.X509Certificate;

    beforeAll(async () => {
      issued = await enrolled();
      await createApprovalPolicy({
        policyType: ApprovalPolicyType.CertRequest,
        authToken,
        applicationId,
        profileSlug,
        constraints: { operation: CertRequestPolicyOperation.Renewal },
        steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: seedData1.id }] }]
      });
    });

    test("holds re-enrollment for approval but not a new enrollment", async () => {
      await enrolled();

      const res = await enroll("simplereenroll", { clientCert: issued.toString("pem") });

      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json<{ message: string }>().message).toContain("requires approval");
      expect((await stored(issued)).renewedByCertificateId ?? null, "nothing is linked while it waits").toBeNull();
    });

    test("links the approved re-enrollment to the certificate it replaces", async () => {
      const original = await stored(issued);
      const [held] = (
        await listApplicationApprovalRequests({ policyType: ApprovalPolicyType.CertRequest, applicationId, authToken })
      ).filter((req) => req.status === ApprovalRequestStatus.Pending);
      expect(held, "the re-enrollment raised an approval request").toBeTruthy();

      await decideApprovalRequest({
        policyType: ApprovalPolicyType.CertRequest,
        requestId: held.id,
        decision: "approve",
        authToken
      });

      const renewed = await getCertificate({ authToken, certificateId: original.id });
      expect(renewed.renewedByCertificateId, "the old certificate points to the approved replacement").toBeTruthy();
      const replacement = await getCertificate({ authToken, certificateId: renewed.renewedByCertificateId! });
      expect(replacement.renewedFromCertificateId).toBe(original.id);
    });
  });
});
