import { BadRequestError } from "@app/lib/errors";
import { CertStatus, CrlReason } from "@app/services/certificate/certificate-types";

import { ScepChallengeType } from "./challenge/scep-challenge-types";
import { scepIntuneRevocationSyncQueueFactory } from "./scep-intune-revocation-sync-queue";

type TUploadedResults = {
  results: { requestContext: string; succeeded: boolean; errorCode: string; errorMessage: string | null }[];
};

const downloadRevocationRequests = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const uploadRevocationResults = vi.fn<(args: TUploadedResults) => Promise<void>>();
const decryptAppConnectionCredentials = vi.fn<(args: { encryptedCredentials: string }) => Promise<unknown>>();
const getMicrosoftEntraToken = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));
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

const connection = (id: string, tenantId: string) => ({ id, tenantId, orgId: `org-${id}`, projectId: null });

const runSync = async ({
  connections,
  requests,
  certificates,
  revokeCertAsPlatform = vi.fn().mockImplementation(({ certificateId }: { certificateId: string }) =>
    Promise.resolve({
      cert: { id: certificateId, commonName: "device", serialNumber: "s", applicationId: null },
      ca: { projectId: "project-1" },
      applicationName: null
    })
  )
}: {
  connections: ReturnType<typeof connection>[];
  requests: { requestContext: string; serialNumber: string; issuerName?: string }[];
  certificates: { id: string; serialNumber: string; status: string; validationConnectionId: string }[];
  revokeCertAsPlatform?: ReturnType<typeof vi.fn>;
}) => {
  let handler: (() => Promise<void>) | undefined;
  decryptAppConnectionCredentials.mockImplementation(({ encryptedCredentials }: { encryptedCredentials: string }) =>
    Promise.resolve({ tenantId: encryptedCredentials, clientId: "client", clientSecret: "secret" })
  );
  downloadRevocationRequests.mockResolvedValueOnce(requests).mockResolvedValue([]);
  const certificateDAL = { findScepCertsByValidationConnectionsAndSerials: vi.fn().mockResolvedValue(certificates) };

  scepIntuneRevocationSyncQueueFactory({
    cronJob: {
      register: ({ handler: registered }: { handler: () => Promise<void> }) => {
        handler = registered;
      }
    },
    scepEnrollmentConfigDAL: {
      find: vi
        .fn()
        .mockResolvedValue(
          connections.map((c) => ({ challengeType: ScepChallengeType.MICROSOFT_INTUNE, validationConnectionId: c.id }))
        )
    },
    appConnectionDAL: {
      find: vi
        .fn()
        .mockResolvedValue(
          connections.map((c) => ({ ...c, app: "microsoft-intune", encryptedCredentials: c.tenantId }))
        )
    },
    kmsService: {},
    certificateDAL,
    certificateService: { revokeCertAsPlatform },
    auditLogService: { createAuditLog: vi.fn() }
  } as unknown as Parameters<typeof scepIntuneRevocationSyncQueueFactory>[0]).init();

  await handler!();
  return { certificateDAL, revokeCertAsPlatform };
};

describe("Intune SCEP revocation sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadRevocationRequests.mockReset();
    getMicrosoftEntraToken.mockReset().mockResolvedValue({ accessToken: "token", expiresAt: Date.now() + 60_000 });
  });

  test("revokes a matched certificate and reports success to Intune", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [{ requestContext: "ctx-1", serialNumber: "ABCDEF" }],
      certificates: [
        { id: "cert-1", serialNumber: "abcdef", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }
      ]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledWith({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });
    expect(uploadRevocationResults).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [{ requestContext: "ctx-1", succeeded: true, errorCode: "0", errorMessage: null }]
      })
    );
  });

  test("leaves requests for certificates it did not issue in the Intune queue", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [
        { requestContext: "ours", serialNumber: "aa" },
        { requestContext: "other-ca", serialNumber: "bb" }
      ],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }]
    });

    expect(uploadRevocationResults).toHaveBeenCalledTimes(1);
    expect(uploadRevocationResults.mock.calls[0][0].results).toEqual([
      expect.objectContaining({ requestContext: "ours", succeeded: true })
    ]);
  });

  test("uploads nothing when no request matches", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [{ requestContext: "other-ca", serialNumber: "bb" }],
      certificates: []
    });

    expect(uploadRevocationResults).not.toHaveBeenCalled();
  });

  test("reads one queue per tenant and matches certificates from every connection to it", async () => {
    const { certificateDAL, revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a"), connection("conn-2", "TENANT-A")],
      requests: [{ requestContext: "ctx-1", serialNumber: "aa" }],
      certificates: [{ id: "cert-2", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-2" }]
    });

    expect(downloadRevocationRequests).toHaveBeenCalledTimes(1);
    expect(certificateDAL.findScepCertsByValidationConnectionsAndSerials).toHaveBeenCalledWith(
      ["conn-1", "conn-2"],
      ["aa"]
    );
    expect(revokeCertAsPlatform).toHaveBeenCalledWith(expect.objectContaining({ certificateId: "cert-2" }));
  });

  test("reports an already revoked certificate as succeeded without revoking it again", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [{ requestContext: "ctx-1", serialNumber: "aa" }],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.REVOKED, validationConnectionId: "conn-1" }]
    });

    expect(revokeCertAsPlatform).not.toHaveBeenCalled();
    expect(uploadRevocationResults.mock.calls[0][0].results).toEqual([
      expect.objectContaining({ requestContext: "ctx-1", succeeded: true })
    ]);
  });

  test("reports success when the certificate was revoked after the batch was read", async () => {
    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [
        { requestContext: "ctx-1", serialNumber: "aa" },
        { requestContext: "ctx-2", serialNumber: "aa" }
      ],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }],
      revokeCertAsPlatform: vi
        .fn()
        .mockResolvedValueOnce({
          cert: { id: "cert-1", commonName: "device", serialNumber: "aa", applicationId: null },
          ca: { projectId: "project-1" },
          applicationName: null
        })
        .mockResolvedValueOnce(null)
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(2);
    expect(uploadRevocationResults.mock.calls[0][0].results).toEqual([
      expect.objectContaining({ requestContext: "ctx-1", succeeded: true }),
      expect.objectContaining({ requestContext: "ctx-2", succeeded: true })
    ]);
  });

  test("leaves a transient revocation failure in the queue so the next run retries it", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [{ requestContext: "ctx-1", serialNumber: "aa" }],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }],
      revokeCertAsPlatform: vi.fn().mockRejectedValue(new Error("connection reset by peer"))
    });

    expect(uploadRevocationResults).not.toHaveBeenCalled();
  });

  test("reports a revocation that can never succeed as failed", async () => {
    await runSync({
      connections: [connection("conn-1", "tenant-a")],
      requests: [{ requestContext: "ctx-1", serialNumber: "aa" }],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }],
      revokeCertAsPlatform: vi
        .fn()
        .mockRejectedValue(new BadRequestError({ message: "Cannot revoke imported certificates" }))
    });

    expect(uploadRevocationResults.mock.calls[0][0].results).toEqual([
      {
        requestContext: "ctx-1",
        succeeded: false,
        errorCode: "4000",
        errorMessage: "Cannot revoke imported certificates"
      }
    ]);
  });

  test("falls back to the next connection when the first one cannot reach Intune", async () => {
    getMicrosoftEntraToken
      .mockRejectedValueOnce(new BadRequestError({ message: "AADSTS7000222: client secret expired" }))
      .mockResolvedValue({ accessToken: "token", expiresAt: Date.now() + 60_000 });

    const { revokeCertAsPlatform } = await runSync({
      connections: [connection("conn-1", "tenant-a"), connection("conn-2", "tenant-a")],
      requests: [{ requestContext: "ctx-1", serialNumber: "aa" }],
      certificates: [{ id: "cert-1", serialNumber: "aa", status: CertStatus.ACTIVE, validationConnectionId: "conn-1" }]
    });

    expect(revokeCertAsPlatform).toHaveBeenCalledTimes(1);
    expect(uploadRevocationResults).toHaveBeenCalledTimes(1);
  });
});
