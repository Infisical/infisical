import * as x509 from "@peculiar/x509";
import { Certificate, ContentInfo, SignedData } from "pkijs";

import { ProjectType } from "@app/db/schemas";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

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
    restoreLicense = overrideLicenseFeatures({ pkiEst: true, maxCas: 100, maxInternalCas: 100 });
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
  });

  afterAll(async () => {
    restoreLicense?.();
    await cleanup?.();
  });

  test("issues a certificate on simpleenroll and renews it on simplereenroll", async () => {
    const enrollRes = await enroll("simpleenroll");

    expect(enrollRes.statusCode, enrollRes.payload).toBe(200);
    expect(enrollRes.headers["content-type"]).toContain("application/pkcs7-mime");
    const issued = leafCertificateFromPkcs7(enrollRes.payload);
    expect(issued.subject).toBe(`CN=${COMMON_NAME}`);

    const reenrollRes = await enroll("simplereenroll", { clientCert: issued.toString("pem") });

    expect(reenrollRes.statusCode, reenrollRes.payload).toBe(200);
    const renewed = leafCertificateFromPkcs7(reenrollRes.payload);
    expect(renewed.subject).toBe(`CN=${COMMON_NAME}`);
    expect(renewed.serialNumber).not.toBe(issued.serialNumber);
  });

  test("rejects a wrong passphrase", async () => {
    const res = await enroll("simpleenroll", { passphrase: "not-the-passphrase" });

    expect(res.statusCode, res.payload).toBe(401);
  });
});
