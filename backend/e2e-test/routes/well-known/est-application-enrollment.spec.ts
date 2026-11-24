import * as x509 from "@peculiar/x509";
import { Certificate, ContentInfo, SignedData } from "pkijs";

import { ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApproverType,
  CertRequestPolicyOperation
} from "@app/services/approval-policy/approval-policy-enums";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import {
  createApprovalPolicy,
  decideApprovalRequest,
  getCertificate,
  listApplicationApprovalRequests
} from "../../testUtils/cert-manager";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { listUserNotifications } from "../../testUtils/notifications";

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
  let projectId = "";
  let profileId = "";

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
    {
      passphrase = PASSPHRASE,
      clientCert,
      baseUrl = estBaseUrl
    }: { passphrase?: string; clientCert?: string; baseUrl?: string } = {}
  ) =>
    testServer.inject({
      method: "POST",
      url: `${baseUrl}/${operation}`,
      headers: {
        authorization: basicAuth(passphrase),
        "content-type": "application/pkcs10",
        ...(clientCert && { "x-ssl-client-cert": encodeURIComponent(clientCert) })
      },
      payload: await generateCsr()
    });

  const estUrlFor = (appId: string) => `/.well-known/est/applications/${appId}/profiles/${profileId}`;

  const createEstApplication = async (name: string) => {
    const { application } = await post(`/api/v1/cert-manager/applications?projectId=${projectId}`, {
      name,
      profileIds: [profileId]
    });

    const estRes = await testServer.inject({
      method: "PUT",
      url: `/api/v1/cert-manager/applications/${application.id}/profiles/${profileId}/enrollment/est?projectId=${projectId}`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { passphrase: PASSPHRASE, disableBootstrapCaValidation: true }
    });
    expect(estRes.statusCode, estRes.payload).toBe(200);
    return application.id as string;
  };

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ pkiEst: true, pkiApprovals: true, maxCas: 100, maxInternalCas: 100 });
    ({ authToken, cleanup } = await createIsolatedOrgAndProject("est-application"));

    const { project } = await post("/api/v1/projects", {
      projectName: "EST application enrollment",
      type: ProjectType.CertificateManager
    });
    projectId = project.id as string;
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

    profileId = certificateProfile.id;
    profileSlug = certificateProfile.slug;
    applicationId = await createEstApplication("est-application");
    estBaseUrl = estUrlFor(applicationId);
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
    const { certificates } = await post("/api/v1/cert-manager/certificates/search", { search: cert.serialNumber });
    const [match] = certificates as { id: string }[];
    expect(certificates, `certificate ${cert.serialNumber} is in the inventory`).toHaveLength(1);
    return getCertificate({ authToken, certificateId: match.id });
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

  test("links a re-enrollment with an already-renewed certificate to the latest one in its chain", async () => {
    const issued = await enrolled();
    const firstRenewal = await reenrolled(issued);

    const secondRenewal = await reenrolled(issued);

    expect(secondRenewal.serialNumber, "the second re-enrollment issues a new certificate").not.toBe(
      firstRenewal.serialNumber
    );
    const [original, first, second] = [await stored(issued), await stored(firstRenewal), await stored(secondRenewal)];
    expect(original.renewedByCertificateId, "the old certificate keeps its first replacement").toBe(first.id);
    expect(first.renewedByCertificateId, "the first replacement is renewed by the second").toBe(second.id);
    expect(second.renewedFromCertificateId).toBe(first.id);
  });

  test("doesn't mark another Application's certificate renewed when a client re-enrolls with it here", async () => {
    const issued = await enrolled();
    const otherApplicationUrl = estUrlFor(await createEstApplication("est-other-application"));

    const res = await enroll("simplereenroll", { clientCert: issued.toString("pem"), baseUrl: otherApplicationUrl });

    expect(res.statusCode, res.payload).toBe(200);
    const original = await stored(issued);
    expect(original.renewedByCertificateId ?? null, "the first Application's certificate isn't linked").toBeNull();
    expect((await stored(leafCertificateFromPkcs7(res.payload))).renewedFromCertificateId ?? null).toBeNull();
  });

  test("rejects a wrong passphrase", async () => {
    const res = await enroll("simpleenroll", { passphrase: "not-the-passphrase" });

    expect(res.statusCode, res.payload).toBe(401);
  });

  // Runs last: the policy it creates covers every later re-enrollment on this profile.
  describe("with a Renewal approval policy on the profile", async () => {
    let issued: x509.X509Certificate;

    const pendingApprovals = async () =>
      (
        await listApplicationApprovalRequests({ policyType: ApprovalPolicyType.CertRequest, applicationId, authToken })
      ).filter((req) => req.status === ApprovalRequestStatus.Pending);

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

      const [held] = await pendingApprovals();
      const notice = (await listUserNotifications(authToken)).find((n) => n.link?.includes(`/approvals/${held.id}`));
      expect(notice?.body, "approvers are told it's a renewal").toContain("asked to renew");
    });

    test("refuses another re-enrollment while one waits for approval", async () => {
      const res = await enroll("simplereenroll", { clientCert: issued.toString("pem") });

      expect(res.statusCode, res.payload).toBe(400);
      expect(res.json<{ message: string }>().message).toBe(
        "A renewal of this certificate is already waiting for approval."
      );
      expect(await pendingApprovals(), "no second approval request was raised").toHaveLength(1);
    });

    test("links the approved re-enrollment to the certificate it replaces", async () => {
      const original = await stored(issued);
      const [held] = await pendingApprovals();
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
