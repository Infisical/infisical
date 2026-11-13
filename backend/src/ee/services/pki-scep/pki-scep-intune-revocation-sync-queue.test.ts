import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "@app/services/certificate/certificate-types";

import { scepIntuneRevocationSyncQueueFactory } from "./pki-scep-intune-revocation-sync-queue";

type TUploadedResults = {
  results: { requestContext: string; succeeded: boolean; errorCode: string; errorMessage: string | null }[];
};
type TRequest = { requestContext: string; serialNumber: string; issuerName?: string | null };
type TMatched = {
  id: string;
  serialNumber: string;
  status: string;
  projectId: string;
  caId: string | null;
  caCertId?: string | null;
};

const downloadRevocationRequests = vi.fn<(...args: unknown[]) => Promise<TRequest[]>>();
const uploadRevocationResults = vi.fn<(args: TUploadedResults) => Promise<void>>();
const decryptAppConnectionCredentials = vi.fn<(args: { encryptedCredentials: string }) => Promise<unknown>>();
const getMicrosoftEntraToken = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));
vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-1")
}));
vi.mock("@peculiar/x509", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@peculiar/x509")>()),
  X509Certificate: class {
    issuer: string;

    subject: string;

    constructor(raw: Uint8Array) {
      this.issuer = Buffer.from(raw).toString();
      this.subject = Buffer.from(raw).toString();
    }
  }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: (args: { encryptedCredentials: string }) => decryptAppConnectionCredentials(args)
}));
vi.mock("@app/services/app-connection/microsoft-intune", () => ({
  INTUNE_MAX_REVOCATION_REQUESTS: 500,
  IntuneRevocationErrorCode: { None: "0", NonRetryableServiceException: "4000" },
  MicrosoftEntraTokenResource: { Graph: "graph", Intune: "intune" },
  getMicrosoftEntraToken: (...args: unknown[]) => getMicrosoftEntraToken(...args),
  discoverPkiConnectorServiceUri: vi
    .fn()
    .mockResolvedValue("https://fef.example.manage.microsoft.com/PkiConnectorFEService"),
  intuneDownloadRevocationRequests: (...args: unknown[]) => downloadRevocationRequests(...args),
  intuneUploadRevocationResults: (args: TUploadedResults) => uploadRevocationResults(args)
}));

const ISSUER = "CN=Test";
const connection = (id: string, tenantId: string) => ({ id, tenantId, orgId: `org-${id}`, projectId: null });
const matched = (id: string, serialNumber: string, status: string = CertStatus.ACTIVE): TMatched => ({
  id,
  serialNumber,
  status,
  projectId: "project-1",
  caId: "ca-1"
});
const revoked = (certificateId: string, caId = "ca-1") => ({
  outcome: PlatformRevocationOutcome.Revoked,
  cert: { id: certificateId, commonName: "device", serialNumber: "s", applicationId: null },
  ca: { id: caId, projectId: "project-1" },
  applicationName: null
});

const runSync = async ({
  connections,
  batches,
  certificates,
  issuers = {},
  deletedBodies = [],
  caCertSubjects = {},
  enrollmentConnectionIds,
  createAuditLog = vi.fn(),
  revokeCertAsPlatform = vi
    .fn()
    .mockImplementation(({ certificateId }: { certificateId: string }) => Promise.resolve(revoked(certificateId)))
}: {
  connections: ReturnType<typeof connection>[];
  batches: TRequest[][];
  certificates: TMatched[];
  issuers?: Record<string, string>;
  deletedBodies?: string[];
  caCertSubjects?: Record<string, string>;
  enrollmentConnectionIds?: string[];
  revokeCertAsPlatform?: ReturnType<typeof vi.fn>;
  createAuditLog?: ReturnType<typeof vi.fn>;
}) => {
  let handler: (() => Promise<void>) | undefined;
  decryptAppConnectionCredentials.mockImplementation(({ encryptedCredentials }) => {
    const [tenantId, connectionId] = encryptedCredentials.split("|");
    return Promise.resolve({ tenantId, clientId: `client-${connectionId}`, clientSecret: "secret" });
  });
  batches.forEach((batch) => downloadRevocationRequests.mockResolvedValueOnce(batch));
  downloadRevocationRequests.mockResolvedValue([]);

  const certificateDAL = {
    findScepCertsByValidationConnectionsAndSerials: vi
      .fn()
      .mockImplementation((_scopes: unknown, serials: string[]) =>
        Promise.resolve(certificates.filter((certificate) => serials.includes(certificate.serialNumber)))
      )
  };
  const certificateService = {
    revokeCertAsPlatform,
    rebuildCrlsAfterPlatformRevocations: vi.fn().mockResolvedValue(undefined)
  };

  scepIntuneRevocationSyncQueueFactory({
    cronJob: {
      register: ({ handler: registered }: { handler: () => Promise<void> }) => {
        handler = registered;
      }
    },
    scepEnrollmentConfigDAL: {
      find: vi.fn().mockResolvedValue(
        (enrollmentConnectionIds ?? connections.map((c) => c.id)).map((validationConnectionId) => ({
          validationConnectionId
        }))
      )
    },
    appConnectionDAL: {
      find: vi
        .fn()
        .mockImplementation(({ $in }: { $in: { id: string[] } }) =>
          Promise.resolve(
            connections
              .filter((c) => $in.id.includes(c.id))
              .map((c) => ({ ...c, encryptedCredentials: `${c.tenantId}|${c.id}` }))
          )
        )
    },
    kmsService: {
      decryptWithKmsKey: vi.fn().mockResolvedValue(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    },
    projectDAL: {},
    certificateDAL,
    certificateBodyDAL: {
      findOne: vi
        .fn()
        .mockImplementation(({ certId }: { certId: string }) =>
          Promise.resolve(
            deletedBodies.includes(certId)
              ? undefined
              : { encryptedCertificate: Buffer.from(issuers[certId] ?? ISSUER) }
          )
        )
    },
    certificateAuthorityCertDAL: {
      findById: vi
        .fn()
        .mockImplementation((caCertId: string) =>
          Promise.resolve(
            caCertSubjects[caCertId] ? { encryptedCertificate: Buffer.from(caCertSubjects[caCertId]) } : undefined
          )
        )
    },
    certificateService,
    auditLogService: { createAuditLog }
  } as unknown as Parameters<typeof scepIntuneRevocationSyncQueueFactory>[0]).init();

  await handler!();
  return { certificateDAL, certificateService, revokeCertAsPlatform };
};

const uploadedResults = (call = 0) => uploadRevocationResults.mock.calls[call][0].results;

describe("Intune SCEP revocation sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadRevocationRequests.mockReset();
    getMicrosoftEntraToken.mockReset().mockResolvedValue({ accessToken: "token", expiresAt: Date.now() + 60_000 });
  });

  test("revokes a matched certificate, rebuilds its CA's CRL and reports success", async () => {
    const { revokeCertAsPlatform, certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "AA", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledWith({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });
    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1"]);
    expect(uploadedResults()).toEqual([
      { requestContext: "ctx-1", succeeded: true, errorCode: "0", errorMessage: null }
    ]);
  });

  test("rebuilds the CRLs once for a batch with several revocations", async () => {
    const { certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [
        [
          { requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER },
          { requestContext: "ctx-2", serialNumber: "bb", issuerName: ISSUER }
        ]
      ],
      certificates: [matched("cert-1", "aa"), matched("cert-2", "bb")]
    });

    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledTimes(1);
    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1", "ca-1"]);
  });

  test("leaves a request whose issuer differs from the stored certificate's issuer in the queue", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: "CN=Other CA" }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(revokeCertAsPlatform).not.toHaveBeenCalled();
    expect(uploadRevocationResults).not.toHaveBeenCalled();
  });

  test("checks a deleted certificate's issuer against its CA certificate", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [
        [
          { requestContext: "ours", serialNumber: "aa", issuerName: ISSUER },
          { requestContext: "other-ca", serialNumber: "bb", issuerName: "CN=Other CA" }
        ]
      ],
      certificates: [
        { ...matched("cert-1", "aa"), caCertId: "ca-cert-1" },
        { ...matched("cert-2", "bb"), caCertId: "ca-cert-1" }
      ],
      deletedBodies: ["cert-1", "cert-2"],
      caCertSubjects: { "ca-cert-1": ISSUER }
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(1);
    expect(revokeCertAsPlatform).toHaveBeenCalledWith(expect.objectContaining({ certificateId: "cert-1" }));
    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ours", succeeded: true })]);
  });

  test("matches by serial when a deleted certificate's issuer can't be read", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      deletedBodies: ["cert-1"]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledWith(expect.objectContaining({ certificateId: "cert-1" }));
    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ctx-1", succeeded: true })]);
  });

  test("leaves requests for certificates it did not issue in the queue", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [
        [
          { requestContext: "ours", serialNumber: "aa", issuerName: ISSUER },
          { requestContext: "other-ca", serialNumber: "bb", issuerName: ISSUER }
        ]
      ],
      certificates: [matched("cert-1", "aa")]
    });

    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ours", succeeded: true })]);
  });

  test("reads one queue per tenant and matches certificates from every enrollment connection to it", async () => {
    const { certificateDAL } = await runSync({
      connections: [connection("conn-1", "tenant-a"), connection("conn-2", "TENANT-A")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-2", "aa")]
    });

    expect(downloadRevocationRequests).toHaveBeenCalledTimes(1);
    expect(certificateDAL.findScepCertsByValidationConnectionsAndSerials).toHaveBeenCalledWith(
      ["conn-1", "conn-2"],
      ["aa"]
    );
  });

  test("ignores Intune connections that no SCEP enrollment uses", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      enrollmentConnectionIds: [],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(downloadRevocationRequests).not.toHaveBeenCalled();
    expect(uploadRevocationResults).not.toHaveBeenCalled();
  });

  test("reports an already revoked certificate as succeeded without revoking it again", async () => {
    const { revokeCertAsPlatform, certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa", CertStatus.REVOKED)]
    });

    expect(revokeCertAsPlatform).not.toHaveBeenCalled();
    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1"]);
    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ctx-1", succeeded: true })]);
  });

  test("reports success when the certificate was revoked after the batch was read", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      revokeCertAsPlatform: vi.fn().mockResolvedValue({ outcome: PlatformRevocationOutcome.AlreadyRevoked })
    });

    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ctx-1", succeeded: true })]);
  });

  test("reports a certificate this CA cannot revoke as a permanent failure", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      revokeCertAsPlatform: vi.fn().mockResolvedValue({
        outcome: PlatformRevocationOutcome.NotRevocable,
        reason: "Certificate revocation is not supported by this certificate authority type"
      })
    });

    expect(uploadedResults()).toEqual([
      {
        requestContext: "ctx-1",
        succeeded: false,
        errorCode: "4000",
        errorMessage: "Certificate revocation is not supported by this certificate authority type"
      }
    ]);
  });

  test("rebuilds the CA's CRL when a revocation fails after it committed", async () => {
    const { certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      revokeCertAsPlatform: vi.fn().mockRejectedValue(new Error("alert queue unavailable"))
    });

    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1"]);
    expect(uploadRevocationResults).not.toHaveBeenCalled();
  });

  test("leaves an upstream CA failure in the queue so a later run retries it", async () => {
    const { certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      revokeCertAsPlatform: vi
        .fn()
        .mockRejectedValue(new BadRequestError({ message: "ADCS gateway operation failed: 503 Service Unavailable" }))
    });

    expect(uploadRevocationResults).not.toHaveBeenCalled();
    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1"]);
  });

  test("falls back to the next connection when the first one cannot reach Intune", async () => {
    getMicrosoftEntraToken
      .mockRejectedValueOnce(new BadRequestError({ message: "AADSTS7000222: client secret expired" }))
      .mockResolvedValue({ accessToken: "token", expiresAt: Date.now() + 60_000 });

    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a"), connection("conn-2", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(1);
    expect(uploadRevocationResults).toHaveBeenCalledTimes(1);
    expect(getMicrosoftEntraToken.mock.calls[0][0]).toEqual(expect.objectContaining({ clientId: "client-conn-1" }));
    expect(getMicrosoftEntraToken.mock.calls[1][0]).toEqual(expect.objectContaining({ clientId: "client-conn-2" }));
  });

  test("matches an issuer whose name parts Intune returns in a different order", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: "C=US, O=Infisical, CN=Root CA" }]],
      certificates: [matched("cert-1", "aa")],
      issuers: { "cert-1": "CN=Root CA, O=Infisical, C=US" }
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["S=", "CN=Root CA, S=California, C=US", "C=US, ST=California, CN=Root CA"],
    ["emailAddress=", "CN=Root CA, emailAddress=pki@example.com", "E=pki@example.com, CN=Root CA"],
    ["EMAILADDRESS=", "CN=Root CA, EMAILADDRESS=pki@example.com", "E=pki@example.com, CN=Root CA"],
    ["SERIALNUMBER=", "SERIALNUMBER=123, CN=Root CA", "CN=Root CA, 2.5.4.5=123"]
  ])("matches an issuer that spells %s differently", async (_name, intuneIssuer, storedIssuer) => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: intuneIssuer }]],
      certificates: [matched("cert-1", "aa")],
      issuers: { "cert-1": storedIssuer }
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(1);
  });

  test("still tells a different state apart", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: "CN=Root CA, S=Oregon, C=US" }]],
      certificates: [matched("cert-1", "aa")],
      issuers: { "cert-1": "CN=Root CA, ST=California, C=US" }
    });

    expect(revokeCertAsPlatform).not.toHaveBeenCalled();
  });

  test("keeps paging past a full batch that holds no request of ours", async () => {
    const foreignBatch = Array.from({ length: 500 }, (_, index) => ({
      requestContext: `foreign-${index}`,
      serialNumber: `f${index}`,
      issuerName: "CN=Other CA"
    }));

    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [foreignBatch, [{ requestContext: "ours", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(downloadRevocationRequests).toHaveBeenCalledTimes(2);
    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ours", succeeded: true })]);
  });

  test("still reports the revocation and rebuilds the CRL when the audit log write fails", async () => {
    const { certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      createAuditLog: vi.fn().mockRejectedValue(new Error("audit log queue unavailable"))
    });

    expect(certificateService.rebuildCrlsAfterPlatformRevocations).toHaveBeenCalledWith(["ca-1"]);
    expect(uploadedResults()).toEqual([expect.objectContaining({ requestContext: "ctx-1", succeeded: true })]);
  });

  test("warns when the run stops at the batch limit", async () => {
    const fullBatch = Array.from({ length: 500 }, (_, index) => ({
      requestContext: `ctx-${index}`,
      serialNumber: `s${index}`,
      issuerName: ISSUER
    }));

    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: Array.from({ length: 10 }, () => fullBatch),
      certificates: fullBatch.map((request, index) => matched(`cert-${index}`, request.serialNumber))
    });

    expect(downloadRevocationRequests).toHaveBeenCalledTimes(10);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("stopped at the batch limit"));
  });
});
