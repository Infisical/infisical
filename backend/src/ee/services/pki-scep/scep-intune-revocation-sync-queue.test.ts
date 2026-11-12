import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "@app/services/certificate/certificate-types";

import { scepIntuneRevocationSyncQueueFactory } from "./scep-intune-revocation-sync-queue";

type TUploadedResults = {
  results: { requestContext: string; succeeded: boolean; errorCode: string; errorMessage: string | null }[];
};
type TRequest = { requestContext: string; serialNumber: string; issuerName?: string | null };
type TMatched = { id: string; serialNumber: string; status: string; projectId: string };

const downloadRevocationRequests = vi.fn<(...args: unknown[]) => Promise<TRequest[]>>();
const uploadRevocationResults = vi.fn<(args: TUploadedResults) => Promise<void>>();
const decryptAppConnectionCredentials = vi.fn<(args: { encryptedCredentials: string }) => Promise<unknown>>();
const getMicrosoftEntraToken = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));
vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-1")
}));
vi.mock("@peculiar/x509", () => ({
  X509Certificate: class {
    issuer: string;

    constructor(raw: Uint8Array) {
      this.issuer = Buffer.from(raw).toString();
    }
  }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: (args: { encryptedCredentials: string }) => decryptAppConnectionCredentials(args)
}));
vi.mock("@app/services/app-connection/microsoft-intune", () => ({
  INTUNE_MAX_REVOCATION_REQUESTS: 500,
  MicrosoftEntraTokenResource: { Graph: "graph", Intune: "intune" },
  getMicrosoftEntraToken: (...args: unknown[]) => getMicrosoftEntraToken(...args),
  discoverPkiConnectorServiceUri: vi
    .fn()
    .mockResolvedValue("https://fef.example.manage.microsoft.com/PkiConnectorFEService"),
  intuneDownloadRevocationRequests: (...args: unknown[]) => downloadRevocationRequests(...args),
  intuneUploadRevocationResults: (args: TUploadedResults) => uploadRevocationResults(args)
}));

const ISSUER = "CN=Test";
const connection = (id: string, tenantId: string, orgId = `org-${id}`) => ({ id, tenantId, orgId, projectId: null });
const matched = (id: string, serialNumber: string, status: string = CertStatus.ACTIVE): TMatched => ({
  id,
  serialNumber,
  status,
  projectId: "project-1"
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
  revokeCertAsPlatform = vi
    .fn()
    .mockImplementation(({ certificateId }: { certificateId: string }) => Promise.resolve(revoked(certificateId)))
}: {
  connections: ReturnType<typeof connection>[];
  batches: TRequest[][];
  certificates: TMatched[];
  issuers?: Record<string, string>;
  revokeCertAsPlatform?: ReturnType<typeof vi.fn>;
}) => {
  let handler: (() => Promise<void>) | undefined;
  decryptAppConnectionCredentials.mockImplementation(({ encryptedCredentials }) =>
    Promise.resolve({ tenantId: encryptedCredentials, clientId: "client", clientSecret: "secret" })
  );
  batches.forEach((batch) => downloadRevocationRequests.mockResolvedValueOnce(batch));
  downloadRevocationRequests.mockResolvedValue([]);

  const certificateDAL = {
    findScepIssuedCertsByOrgsAndSerials: vi
      .fn()
      .mockImplementation((_orgIds: string[], serials: string[]) =>
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
    appConnectionDAL: {
      find: vi.fn().mockResolvedValue(connections.map((c) => ({ ...c, encryptedCredentials: c.tenantId })))
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
          Promise.resolve({ encryptedCertificate: Buffer.from(issuers[certId] ?? ISSUER) })
        )
    },
    certificateService,
    auditLogService: { createAuditLog: vi.fn() }
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

  test("revokes a matched certificate with a deferred CRL rebuild and reports success", async () => {
    const { revokeCertAsPlatform, certificateService } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "AA", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledWith({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED,
      deferCrlRebuild: true
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

  test("reads one queue per tenant and matches certificates from every org connected to it", async () => {
    const { certificateDAL } = await runSync({
      connections: [connection("conn-1", "tenant-a", "org-1"), connection("conn-2", "TENANT-A", "org-2")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-2", "aa")]
    });

    expect(downloadRevocationRequests).toHaveBeenCalledTimes(1);
    expect(certificateDAL.findScepIssuedCertsByOrgsAndSerials).toHaveBeenCalledWith(["org-1", "org-2"], ["aa"]);
  });

  test("reports an already revoked certificate as succeeded without revoking it again", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa", CertStatus.REVOKED)]
    });

    expect(revokeCertAsPlatform).not.toHaveBeenCalled();
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

  test("leaves an upstream CA failure in the queue so a later run retries it", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      batches: [[{ requestContext: "ctx-1", serialNumber: "aa", issuerName: ISSUER }]],
      certificates: [matched("cert-1", "aa")],
      revokeCertAsPlatform: vi
        .fn()
        .mockRejectedValue(new BadRequestError({ message: "ADCS gateway operation failed: 503 Service Unavailable" }))
    });

    expect(uploadRevocationResults).not.toHaveBeenCalled();
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
