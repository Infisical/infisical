import * as x509 from "@peculiar/x509";

import { ProjectType } from "@app/db/schemas";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";

const COMMON_NAME = "csr-signature.example.com";

const RSA_SHA256 = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048
};
const RSA_SHA384 = { ...RSA_SHA256, hash: "SHA-384" };
const ECDSA_P256 = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

const generateCsr = async (signingAlgorithm: RsaHashedKeyGenParams | EcKeyGenParams) => {
  const keys = (await crypto.subtle.generateKey(signingAlgorithm, true, ["sign", "verify"])) as CryptoKeyPair;
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${COMMON_NAME}`,
    keys,
    signingAlgorithm
  });
  return csr.toString("pem");
};

const issuedSignatureAlgorithm = (pem: string) => {
  const { signatureAlgorithm } = new x509.X509Certificate(pem);
  return {
    name: signatureAlgorithm.name,
    hash: (signatureAlgorithm as unknown as { hash: { name: string } }).hash.name
  };
};

type TIssuer = { profileId: string; applicationId: string };

describe("Signing a CSR whose algorithm differs from the CA's", async () => {
  let authToken = "";
  let projectId = "";
  let cleanup: () => Promise<void>;
  let restoreLicense: () => void;

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

  const createProfile = async (
    slug: string,
    keyAlgorithm: CertKeyAlgorithm,
    algorithms?: { signature: string[] }
  ): Promise<TIssuer> => {
    const ca = await post("/api/v1/pki/ca/internal", {
      projectId,
      name: `${slug}-ca`,
      status: CaStatus.ACTIVE,
      enableDirectIssuance: true,
      configuration: {
        type: InternalCaType.ROOT,
        commonName: `${slug} Root CA`,
        keyAlgorithm,
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const { certificatePolicy } = await post("/api/v1/cert-manager/certificate-policies", {
      projectId,
      name: `${slug}-policy`,
      subject: [{ type: "common_name", allowed: [COMMON_NAME] }],
      ...(algorithms && { algorithms })
    });

    const { certificateProfile } = await post("/api/v1/cert-manager/certificate-profiles", {
      projectId,
      caId: ca.id,
      certificatePolicyId: certificatePolicy.id,
      slug
    });

    const { application } = await post(`/api/v1/cert-manager/applications?projectId=${projectId}`, {
      name: `${slug}-application`,
      profileIds: [certificateProfile.id]
    });
    const enrollmentRes = await testServer.inject({
      method: "PUT",
      url: `/api/v1/cert-manager/applications/${application.id}/profiles/${certificateProfile.id}/enrollment/api?projectId=${projectId}`,
      headers: { authorization: `Bearer ${authToken}` },
      body: {}
    });
    expect(enrollmentRes.statusCode, enrollmentRes.payload).toBe(200);

    return { profileId: certificateProfile.id as string, applicationId: application.id as string };
  };

  const signCsr = async (issuer: TIssuer, csr: string) => {
    const { certificate } = await post("/api/v1/cert-manager/certificates", {
      ...issuer,
      csr,
      attributes: { ttl: "30d" }
    });
    return certificate.certificate as string;
  };

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ maxCas: 100, maxInternalCas: 100 });
    ({ authToken, cleanup } = await createIsolatedOrgAndProject("csr-signature-algorithm"));

    const { project } = await post("/api/v1/projects", {
      projectName: "CSR signature algorithm",
      type: ProjectType.CertificateManager
    });
    projectId = project.id as string;
    await post("/api/v1/cert-manager/instance/active-project", { projectId });
  });

  afterAll(async () => {
    restoreLicense?.();
    await cleanup?.();
  });

  test("an RSA CA signs an ECDSA-signed CSR with RSA", async () => {
    const issuer = await createProfile("rsa-ca", CertKeyAlgorithm.RSA_2048);

    const certificate = await signCsr(issuer, await generateCsr(ECDSA_P256));

    expect(issuedSignatureAlgorithm(certificate)).toEqual({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" });
  });

  test("an ECDSA P-384 CA signs an RSA-signed CSR with its own default", async () => {
    const issuer = await createProfile("ec-ca", CertKeyAlgorithm.ECDSA_P384);

    const certificate = await signCsr(issuer, await generateCsr(RSA_SHA256));

    expect(issuedSignatureAlgorithm(certificate)).toEqual({ name: "ECDSA", hash: "SHA-384" });
  });

  test("a CSR signature the CA can produce keeps its hash", async () => {
    const issuer = await createProfile("rsa-ca-hash", CertKeyAlgorithm.RSA_2048);

    const certificate = await signCsr(issuer, await generateCsr(RSA_SHA384));

    expect(issuedSignatureAlgorithm(certificate)).toEqual({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" });
  });

  test("the policy's signature algorithms constrain the issued certificate, not the CSR", async () => {
    const issuer = await createProfile("rsa-ca-policy", CertKeyAlgorithm.RSA_2048, {
      signature: ["RSA-SHA256"]
    });

    const certificate = await signCsr(issuer, await generateCsr(ECDSA_P256));

    expect(issuedSignatureAlgorithm(certificate)).toEqual({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" });
  });

  test("a CSR hash the policy doesn't allow falls back to one it does", async () => {
    const issuer = await createProfile("rsa-ca-policy-hash", CertKeyAlgorithm.RSA_2048, {
      signature: ["RSA-SHA256"]
    });

    const certificate = await signCsr(issuer, await generateCsr(RSA_SHA384));

    expect(issuedSignatureAlgorithm(certificate)).toEqual({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" });
  });
});
