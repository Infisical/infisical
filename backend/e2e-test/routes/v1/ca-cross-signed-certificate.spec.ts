import * as x509 from "@peculiar/x509";

import { ProjectMembershipRole, ProjectType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { CaStatus, InternalCaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { addIdentityToProject, createIdentityActor } from "../../testUtils/identities";
import { overrideLicenseFeatures } from "../../testUtils/license";

const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ROOT_CA_DN = "O=Acme, CN=Corp Root CA";
const ISSUING_CA_DN = "O=Acme, CN=Corp Issuing CA";
const LEGACY_ROOT_DN = "CN=Legacy Root CA G2, O=Acme";

const KEY_MISMATCH_MESSAGE = "This certificate's key doesn't match this CA. Have the old CA sign the CSR from this CA.";
const SUBJECT_MISMATCH_MESSAGE =
  "This certificate's subject doesn't match this CA. Have the old CA sign the CSR from this CA.";
const KEY_IDENTIFIER_MISMATCH_MESSAGE =
  "This certificate's key identifier doesn't match this CA. Have the old CA keep the key identifier from the CSR.";

const authHeaders = (token = jwtAuthToken) => ({
  authorization: `Bearer ${token}`
});

const crossSignedCertUrl = (caId: string) => `/api/v1/cert-manager/ca/internal/${caId}/cross-signed-certificate`;

const generateKeys = () =>
  crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;

const splitChain = (chain: string) =>
  (chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
    (pem) => new x509.X509Certificate(pem)
  );

const describeChain = (chain: string) => splitChain(chain).map((cert) => `${cert.subject} <- ${cert.issuer}`);

type TCrossSignedCertificate = {
  caId: string;
  certificate: string;
  certificateChain: string | null;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
};

describe("CA cross-signed certificates", async () => {
  let projectId = "";
  let rootCaId = "";
  let intermediateCaId = "";
  let rootCaSubject = "";
  let rootCaCertificate = "";
  let rootCaPublicKey: CryptoKey;
  let legacyRootKeys: CryptoKeyPair;
  let legacyRoot: x509.X509Certificate;
  let restoreLicense: () => void;

  const signCopy = async ({
    subject = rootCaSubject,
    issuer = legacyRoot.subject,
    publicKey = rootCaPublicKey,
    signingKey = legacyRootKeys.privateKey,
    serialNumber = "0a01",
    notBefore = new Date(Date.now() - 60 * 1000),
    notAfter = new Date(Date.now() + 30 * ONE_DAY_MS),
    isCa = true,
    subjectKeyIdentifier
  }: {
    subject?: string;
    issuer?: string;
    publicKey?: CryptoKey;
    signingKey?: CryptoKey;
    serialNumber?: string;
    notBefore?: Date;
    notAfter?: Date;
    isCa?: boolean;
    subjectKeyIdentifier?: string;
  } = {}) =>
    (
      await x509.X509CertificateGenerator.create({
        serialNumber,
        subject,
        issuer,
        notBefore,
        notAfter,
        publicKey,
        signingKey,
        signingAlgorithm: SIGNING_ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(isCa, undefined, true),
          ...(subjectKeyIdentifier ? [new x509.SubjectKeyIdentifierExtension(subjectKeyIdentifier)] : [])
        ]
      })
    ).toString("pem");

  const createCa = async (name: string, type: InternalCaType) => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/pki/ca/internal",
      headers: authHeaders(),
      body: {
        projectId,
        name,
        status: type === InternalCaType.ROOT ? CaStatus.ACTIVE : CaStatus.PENDING_CERTIFICATE,
        enableDirectIssuance: true,
        configuration: {
          type,
          commonName: name === "corp-root-ca" ? "Corp Root CA" : "Corp Issuing CA",
          organization: "Acme",
          keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
          ...(type === InternalCaType.ROOT && {
            notAfter: new Date(Date.now() + 365 * ONE_DAY_MS).toISOString()
          })
        }
      }
    });

    expect(res.statusCode, res.payload).toBe(200);
    const caId = (res.json() as { id: string }).id;

    await testDb(TableName.CertificateAuthority).where({ id: caId }).update({ enableDirectIssuance: true });

    return caId;
  };

  const importCopy = (caId: string, body: { certificate: string; certificateChain?: string }, token?: string) =>
    testServer.inject({
      method: "PUT",
      url: crossSignedCertUrl(caId),
      headers: authHeaders(token),
      body
    });

  const getCopy = (caId: string, token?: string) =>
    testServer.inject({
      method: "GET",
      url: crossSignedCertUrl(caId),
      headers: authHeaders(token)
    });

  const issueLeaf = async (caId: string) => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/pki/ca/${caId}/issue-certificate`,
      headers: authHeaders(),
      body: { commonName: "service.acme.internal", ttl: "1d" }
    });

    expect(res.statusCode, res.payload).toBe(200);
    return res.json() as {
      certificate: string;
      certificateChain: string;
      serialNumber: string;
    };
  };

  const expectRejected = async (body: { certificate: string; certificateChain?: string }, message: string) => {
    const res = await importCopy(rootCaId, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(message);
  };

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({
      maxCas: 100,
      maxInternalCas: 100
    });

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders(),
      body: {
        projectName: "Cross-signed CAs",
        slug: "cross-signed-cas",
        type: ProjectType.CertificateManager
      }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = (projectRes.json() as { project: { id: string } }).project.id;

    rootCaId = await createCa("corp-root-ca", InternalCaType.ROOT);
    intermediateCaId = await createCa("corp-issuing-ca", InternalCaType.INTERMEDIATE);

    const intermediateCertRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/cert-manager/ca/internal/${intermediateCaId}/certificate`,
      headers: authHeaders(),
      body: {
        parentCaId: rootCaId,
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 180 * ONE_DAY_MS).toISOString(),
        maxPathLength: -1
      }
    });
    expect(intermediateCertRes.statusCode, intermediateCertRes.payload).toBe(200);

    const rootCertRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/cert-manager/ca/internal/${rootCaId}/certificate`,
      headers: authHeaders()
    });
    expect(rootCertRes.statusCode).toBe(200);
    rootCaCertificate = (rootCertRes.json() as { certificate: string }).certificate;

    const rootCaCertObj = new x509.X509Certificate(rootCaCertificate);
    rootCaSubject = rootCaCertObj.subject;
    rootCaPublicKey = await rootCaCertObj.publicKey.export();

    legacyRootKeys = await generateKeys();
    legacyRoot = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: LEGACY_ROOT_DN,
      notBefore: new Date(Date.now() - 60 * 1000),
      notAfter: new Date(Date.now() + 365 * ONE_DAY_MS),
      keys: legacyRootKeys,
      signingAlgorithm: SIGNING_ALGORITHM,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
  });

  afterAll(async () => {
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: authHeaders()
    });

    restoreLicense();
  });

  test("generates a CSR for a root CA with the CA's subject and key", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/cert-manager/ca/internal/${rootCaId}/csr`,
      headers: authHeaders()
    });

    expect(res.statusCode).toBe(200);
    const csr = new x509.Pkcs10CertificateRequest((res.json() as { csr: string }).csr);
    expect(await csr.verify()).toBe(true);
    expect(csr.subject).toBe(rootCaSubject);
    expect(Buffer.from(csr.publicKey.rawData)).toEqual(
      Buffer.from(new x509.X509Certificate(rootCaCertificate).publicKey.rawData)
    );
  });

  test("returns null when the CA has no cross-signed certificate", async () => {
    const res = await getCopy(rootCaId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ crossSignedCertificate: null });
  });

  test("returns 404 when removing a cross-signed certificate that doesn't exist", async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: crossSignedCertUrl(rootCaId),
      headers: authHeaders()
    });

    expect(res.statusCode).toBe(404);
  });

  test("returns 404 for an unknown CA", async () => {
    const res = await getCopy("0b8a4f7e-3a1d-4c55-9a7e-5d0c1b2a3f4e");

    expect(res.statusCode).toBe(404);
  });

  test("rejects a certificate field that isn't exactly one PEM certificate", async () => {
    const copy = await signCopy();

    expect((await importCopy(rootCaId, { certificate: "not a certificate" })).statusCode).toBe(400);
    expect((await importCopy(rootCaId, { certificate: `${copy}\n${copy}` })).statusCode).toBe(400);
  });

  test("rejects a certificate for another key", async () => {
    const otherKeys = await generateKeys();
    await expectRejected({ certificate: await signCopy({ publicKey: otherKeys.publicKey }) }, KEY_MISMATCH_MESSAGE);
  });

  test("rejects a certificate with another subject", async () => {
    await expectRejected({ certificate: await signCopy({ subject: "CN=Someone Else CA" }) }, SUBJECT_MISMATCH_MESSAGE);
  });

  test("rejects a certificate whose key identifier isn't the CA's", async () => {
    await expectRejected(
      { certificate: await signCopy({ subjectKeyIdentifier: "0102030405060708090a0b0c0d0e0f1011121314" }) },
      KEY_IDENTIFIER_MISMATCH_MESSAGE
    );
  });

  test("rejects the CA's own self-signed certificate", async () => {
    const res = await importCopy(rootCaId, { certificate: rootCaCertificate });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/self-signed/);
  });

  test("rejects a subordinate CA's own certificate", async () => {
    const ownCertRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/cert-manager/ca/internal/${intermediateCaId}/certificate`,
      headers: authHeaders()
    });
    expect(ownCertRes.statusCode).toBe(200);

    const res = await importCopy(intermediateCaId, {
      certificate: (ownCertRes.json() as { certificate: string }).certificate
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/the CA's own certificate/);
  });

  test("rejects a certificate that isn't a CA certificate", async () => {
    const res = await importCopy(rootCaId, {
      certificate: await signCopy({ isCa: false })
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/isn't a CA certificate/);
  });

  test("rejects an expired certificate", async () => {
    const res = await importCopy(rootCaId, {
      certificate: await signCopy({
        notBefore: new Date(Date.now() - 10 * ONE_DAY_MS),
        notAfter: new Date(Date.now() - ONE_DAY_MS)
      })
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/expired/);
  });

  test("rejects a chain naming the right issuer but signed by another key", async () => {
    const res = await importCopy(rootCaId, {
      certificate: await signCopy({
        signingKey: (await generateKeys()).privateKey
      }),
      certificateChain: legacyRoot.toString("pem")
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/first certificate in the chain didn't sign/);
  });

  test("rejects a chain that isn't PEM", async () => {
    const res = await importCopy(rootCaId, {
      certificate: await signCopy(),
      certificateChain: "-----BEGIN CERTIFICATE-----\ngarbage\n-----END CERTIFICATE-----"
    });

    expect(res.statusCode).toBe(400);
  });

  test("denies import and removal to a member without IssueCACertificate but lets them read", async () => {
    const { identityId, authToken } = await createIdentityActor({
      orgId: seedData1.organization.id,
      authToken: jwtAuthToken
    });
    await addIdentityToProject({
      projectId,
      identityId,
      role: ProjectMembershipRole.Member,
      authToken: jwtAuthToken
    });

    const readRes = await getCopy(rootCaId, authToken);
    expect(readRes.statusCode).toBe(200);

    const importRes = await importCopy(rootCaId, { certificate: await signCopy() }, authToken);
    expect(importRes.statusCode).toBe(403);

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: crossSignedCertUrl(rootCaId),
      headers: authHeaders(authToken)
    });
    expect(deleteRes.statusCode).toBe(403);

    expect((await getCopy(rootCaId)).json()).toEqual({
      crossSignedCertificate: null
    });
  });

  describe("issuance with a cross-signed root", () => {
    let leafBeforeImport: { serialNumber: string; certificateChain: string };
    let firstCopy = "";

    beforeAll(async () => {
      leafBeforeImport = await issueLeaf(intermediateCaId);
      firstCopy = await signCopy({ serialNumber: "0a02" });
    });

    test("imports a copy without a chain", async () => {
      const res = await importCopy(rootCaId, { certificate: firstCopy });

      expect(res.statusCode).toBe(200);
      const { crossSignedCertificate } = res.json() as {
        crossSignedCertificate: TCrossSignedCertificate;
      };
      expect(crossSignedCertificate.caId).toBe(rootCaId);
      expect(crossSignedCertificate.certificateChain).toBeNull();
      expect(crossSignedCertificate.issuer).toBe(legacyRoot.subject);
      expect(crossSignedCertificate.serialNumber).toBe("0a02");
      expect(new x509.X509Certificate(crossSignedCertificate.certificate).toString("pem")).toBe(
        new x509.X509Certificate(firstCopy).toString("pem")
      );

      const readRes = await getCopy(rootCaId);
      expect(readRes.statusCode).toBe(200);
      expect((readRes.json() as { crossSignedCertificate: TCrossSignedCertificate }).crossSignedCertificate).toEqual(
        crossSignedCertificate
      );
    });

    test("puts the copy in place of the self-signed root for leaves from the intermediate", async () => {
      const leaf = await issueLeaf(intermediateCaId);

      expect(describeChain(leaf.certificateChain)).toEqual([
        `${ISSUING_CA_DN} <- ${ROOT_CA_DN}`,
        `${ROOT_CA_DN} <- ${LEGACY_ROOT_DN}`
      ]);
    });

    test("starts the chain with the copy for leaves from the root itself", async () => {
      const leaf = await issueLeaf(rootCaId);

      expect(describeChain(leaf.certificateChain)).toEqual([`${ROOT_CA_DN} <- ${LEGACY_ROOT_DN}`]);
    });

    test("replaces the copy and sends the legacy chain after it", async () => {
      const { keyId } = await x509.SubjectKeyIdentifierExtension.create(rootCaPublicKey);
      const secondCopy = await signCopy({ serialNumber: "0a03", subjectKeyIdentifier: keyId });
      const res = await importCopy(rootCaId, {
        certificate: secondCopy,
        certificateChain: legacyRoot.toString("pem")
      });

      expect(res.statusCode).toBe(200);
      const { crossSignedCertificate } = res.json() as {
        crossSignedCertificate: TCrossSignedCertificate;
      };
      expect(crossSignedCertificate.serialNumber).toBe("0a03");
      expect(splitChain(crossSignedCertificate.certificateChain ?? "").map((cert) => cert.subject)).toEqual([
        legacyRoot.subject
      ]);

      const leaf = await issueLeaf(intermediateCaId);
      const chain = splitChain(leaf.certificateChain);

      expect(describeChain(leaf.certificateChain)).toEqual([
        `${ISSUING_CA_DN} <- ${ROOT_CA_DN}`,
        `${ROOT_CA_DN} <- ${LEGACY_ROOT_DN}`,
        `${LEGACY_ROOT_DN} <- ${LEGACY_ROOT_DN}`
      ]);
      expect(chain[1].serialNumber).toBe("0a03");

      const leafCert = new x509.X509Certificate(leaf.certificate);
      expect(
        await leafCert.verify({
          publicKey: chain[0].publicKey,
          signatureOnly: true
        })
      ).toBe(true);
      expect(
        await chain[0].verify({
          publicKey: chain[1].publicKey,
          signatureOnly: true
        })
      ).toBe(true);
      expect(
        await chain[1].verify({
          publicKey: chain[2].publicKey,
          signatureOnly: true
        })
      ).toBe(true);
    });

    test("keeps returning the self-signed root as the CA certificate", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/cert-manager/ca/internal/${rootCaId}/certificate`,
        headers: authHeaders()
      });

      expect(res.statusCode).toBe(200);
      const caCert = new x509.X509Certificate((res.json() as { certificate: string }).certificate);
      expect(caCert.subject).toBe(caCert.issuer);
      expect(caCert.toString("pem")).toBe(new x509.X509Certificate(rootCaCertificate).toString("pem"));
    });

    test("leaves the chain of a certificate issued before the import unchanged", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/pki/certificates/${leafBeforeImport.serialNumber}/bundle`,
        headers: authHeaders()
      });

      expect(res.statusCode).toBe(200);
      expect(describeChain((res.json() as { certificateChain: string }).certificateChain)).toEqual(
        describeChain(leafBeforeImport.certificateChain)
      );
    });

    test("skips an expired copy at issuance", async () => {
      const [stored] = await testDb(TableName.CertificateAuthorityCrossSignedCert).where({ caId: rootCaId });

      await testDb(TableName.CertificateAuthorityCrossSignedCert)
        .where({ caId: rootCaId })
        .update({ notAfter: new Date(Date.now() - 60 * 1000) });

      try {
        const leaf = await issueLeaf(intermediateCaId);
        expect(describeChain(leaf.certificateChain)).toEqual([
          `${ISSUING_CA_DN} <- ${ROOT_CA_DN}`,
          `${ROOT_CA_DN} <- ${ROOT_CA_DN}`
        ]);
      } finally {
        await testDb(TableName.CertificateAuthorityCrossSignedCert)
          .where({ caId: rootCaId })
          .update({ notAfter: stored.notAfter });
      }
    });

    test("skips a copy that isn't valid yet at issuance", async () => {
      const [stored] = await testDb(TableName.CertificateAuthorityCrossSignedCert).where({ caId: rootCaId });

      await testDb(TableName.CertificateAuthorityCrossSignedCert)
        .where({ caId: rootCaId })
        .update({ notBefore: new Date(Date.now() + ONE_DAY_MS) });

      try {
        const leaf = await issueLeaf(intermediateCaId);
        expect(describeChain(leaf.certificateChain)).toEqual([
          `${ISSUING_CA_DN} <- ${ROOT_CA_DN}`,
          `${ROOT_CA_DN} <- ${ROOT_CA_DN}`
        ]);
      } finally {
        await testDb(TableName.CertificateAuthorityCrossSignedCert)
          .where({ caId: rootCaId })
          .update({ notBefore: stored.notBefore });
      }
    });

    test("removes the copy and issues with the self-signed root again", async () => {
      const leafWithCopy = await issueLeaf(intermediateCaId);

      const res = await testServer.inject({
        method: "DELETE",
        url: crossSignedCertUrl(rootCaId),
        headers: authHeaders()
      });

      expect(res.statusCode).toBe(200);
      expect(
        (res.json() as { crossSignedCertificate: TCrossSignedCertificate }).crossSignedCertificate.serialNumber
      ).toBe("0a03");
      expect((await getCopy(rootCaId)).json()).toEqual({
        crossSignedCertificate: null
      });

      const leaf = await issueLeaf(intermediateCaId);
      expect(describeChain(leaf.certificateChain)).toEqual([
        `${ISSUING_CA_DN} <- ${ROOT_CA_DN}`,
        `${ROOT_CA_DN} <- ${ROOT_CA_DN}`
      ]);

      const bundleRes = await testServer.inject({
        method: "GET",
        url: `/api/v1/pki/certificates/${leafWithCopy.serialNumber}/bundle`,
        headers: authHeaders()
      });
      expect(bundleRes.statusCode).toBe(200);
      expect(describeChain((bundleRes.json() as { certificateChain: string }).certificateChain)).toEqual(
        describeChain(leafWithCopy.certificateChain)
      );
    });
  });
});
