import { ImpervaCertificateAuthType } from "./imperva-pki-sync-constants";
import {
  buildImpervaCertificatePayload,
  buildImpervaExternalIdentifier,
  parseImpervaExternalIdentifier,
  resolveImpervaAuthType
} from "./imperva-pki-sync-fns";

const RSA_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICsDCCAZgCCQDcwqDsp/lnRDANBgkqhkiG9w0BAQsFADAaMRgwFgYDVQQDDA9y
c2EuZXhhbXBsZS5jb20wHhcNMjYwOTE1MTYyNjAzWhcNMjYwOTE3MTYyNjAzWjAa
MRgwFgYDVQQDDA9yc2EuZXhhbXBsZS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQCw7iX6PgIMsNtTC7tHxmCoXLISlaNII1SxFyLCLwSRjeYXR2oq
dw+TD3MDP4zlVZWAKkgdDdkywh74at7CiHN6LI5FkaJWj/J1FUjVu4EDXg/3DW4C
vcwdXBNnJNm9PN7gXlfqGSGJLgXVTlbfTEi4YteBE2xQVRKulSnExNLno7oF6XJ9
Oz0KuPlzeAGcYce8jzLBJdNaiOeULoPW8y4qBC1RxRJI9IaZLom5SGMM9vf/nlHz
GhCdxzeDYsxhnkJuOvRDZcJmIsz6GdnUXV2zTRDpDd9zn01wibUUhEcZrIFSITfL
OECM44zoFoPB/4rwInmNEdYjV1KtffEg+bsnAgMBAAEwDQYJKoZIhvcNAQELBQAD
ggEBABPaF5UrgC1bDLRy+QQAuuKVnBjaoBjoNoB95yG2bdjLV/vl68RlY4npaGqj
9W8xFI7SzLpTdZt6Qya3o89f4EfRhJwQe1wgkebCMd0iaOzoGPrN9KmhmtLZsaay
N4NzoUqUd+APyvnHA3B7x76kPk0P2MBl11T/BHqpw5MJ+roSVXkstMzaRIx8kMT4
LtXpfCzeM8GvnIfwFW9gsM3+ehOHXbepMUxYV2Gs9lMcZGVvwOxWg2gO/TUnm4sn
O5Lkz7irmjaEu5alF/pzp0wkkv+0vqdzsgcpGhcD2TxVVugD1f+OirRlgI4UC/89
QGHWcAH5c2RYOp2mDX/H9PT7VNo=
-----END CERTIFICATE-----`;

const EC_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICFTCCAbwCCQDGvfCuuhhlmTAKBggqhkjOPQQDAjAZMRcwFQYDVQQDDA5lYy5l
eGFtcGxlLmNvbTAeFw0yNjA5MTUxNjI2MDNaFw0yNjA5MTcxNjI2MDNaMBkxFzAV
BgNVBAMMDmVjLmV4YW1wbGUuY29tMIIBSzCCAQMGByqGSM49AgEwgfcCAQEwLAYH
KoZIzj0BAQIhAP////8AAAABAAAAAAAAAAAAAAAA////////////////MFsEIP//
//8AAAABAAAAAAAAAAAAAAAA///////////////8BCBaxjXYqjqT57PrvVV2mIa8
ZR0GsMxTsPY7zjw+J9JgSwMVAMSdNgiG5wSTamZ44ROdJreBn36QBEEEaxfR8uEs
Qkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sx
Xs7LtkBoN79R9QIhAP////8AAAAA//////////+85vqtpxeehPO5ysL8YyVRAgEB
A0IABG37u2Hh+02YvunRSH6Xbyt8w8lifANs1zfWyC908eFFgDCT4OkKwt/fbwaf
qIthgi09T5werzQ//3CGZsQQe8swCgYIKoZIzj0EAwIDRwAwRAIgR/AWesnHl/q7
sfCQq1nLT7j+3ympSNR1k1rsrp7E0PMCIEK0wzqY/0w/upq1GciYzEHAD+CyvDd2
eCYGkKKes90M
-----END CERTIFICATE-----`;

describe("Imperva auth type resolution", () => {
  test("reads RSA and ECC off the certificate public key", () => {
    expect(resolveImpervaAuthType(RSA_CERT_PEM)).toBe(ImpervaCertificateAuthType.Rsa);
    expect(resolveImpervaAuthType(EC_CERT_PEM)).toBe(ImpervaCertificateAuthType.Ecc);
  });

  test("refuses a certificate whose key type Imperva cannot hold", () => {
    expect(resolveImpervaAuthType("not a certificate")).toBeUndefined();
  });
});

describe("Imperva external identifier", () => {
  test("round trips the site and key type", () => {
    const identifier = buildImpervaExternalIdentifier("12345", ImpervaCertificateAuthType.Ecc);

    expect(identifier).toBe("12345:ECC");
    expect(parseImpervaExternalIdentifier(identifier)).toEqual({
      siteId: "12345",
      authType: ImpervaCertificateAuthType.Ecc
    });
  });

  test("treats an identifier without a key type as RSA", () => {
    expect(parseImpervaExternalIdentifier("12345")).toEqual({
      siteId: "12345",
      authType: ImpervaCertificateAuthType.Rsa
    });
  });
});

describe("Imperva certificate payload", () => {
  test("base64 encodes the leaf followed by the chain", () => {
    const payload = buildImpervaCertificatePayload(RSA_CERT_PEM, EC_CERT_PEM);
    const decoded = Buffer.from(payload, "base64").toString();

    expect(decoded.indexOf(RSA_CERT_PEM)).toBe(0);
    expect(decoded).toContain(EC_CERT_PEM);
  });

  test("encodes the leaf alone when there is no chain", () => {
    const decoded = Buffer.from(buildImpervaCertificatePayload(RSA_CERT_PEM), "base64").toString();

    expect(decoded).toBe(RSA_CERT_PEM);
  });
});

const impervaRequest = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/services/app-connection/imperva/imperva-connection-fns", async (importActual) => {
  const actual = await importActual<typeof import("@app/services/app-connection/imperva/imperva-connection-fns")>();
  return {
    ...actual,
    withImpervaOperation: (
      _config: unknown,
      _gatewayV2Service: unknown,
      operation: (makeRequest: unknown) => unknown
    ) => operation(impervaRequest)
  };
});

describe("Imperva upload failures", () => {
  test("explains what Imperva rejects when it answers a bare 400", async () => {
    const { describeImpervaUploadFailure } = await import("./imperva-pki-sync-fns");
    const { ImpervaRequestError } = await import("@app/services/app-connection/imperva/imperva-connection-fns");

    const rejected = new ImpervaRequestError({ message: "Invalid input", status: 400 });

    expect(describeImpervaUploadFailure(rejected)).toBe(
      "Invalid input. Imperva rejected the certificate. It has to cover at least one domain the website serves, and its key has to be RSA under 4096 bits or ECDSA P-256"
    );
  });

  test("leaves a message that is not a rejection alone", async () => {
    const { describeImpervaUploadFailure } = await import("./imperva-pki-sync-fns");
    const { ImpervaRequestError } = await import("@app/services/app-connection/imperva/imperva-connection-fns");

    const rateLimited = new ImpervaRequestError({
      message: "Imperva rate limited the request, try again shortly",
      status: 429
    });

    expect(describeImpervaUploadFailure(rateLimited)).toBe("Imperva rate limited the request, try again shortly");
  });
});

type TRecordedRequest = { method: string; path: string; params?: Record<string, unknown> };

const firstImpervaRequest = (): TRecordedRequest => impervaRequest.mock.calls[0][0] as TRecordedRequest;

describe("Imperva slot removal", () => {
  const buildFactory = async (records: Array<{ certificateId: string; externalIdentifier: string | null }>) => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const removeCertificatesFromDal = vi.fn();

    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: {
        findByPkiSyncId: vi.fn().mockResolvedValue(records),
        removeCertificates: removeCertificatesFromDal,
        addCertificates: vi.fn(),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(undefined),
        updateById: vi.fn(),
        updateSyncStatus: vi.fn(),
        findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set<string>()),
        claimExternalIdentifier: vi.fn()
      } as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    return { factory, removeCertificatesFromDal };
  };

  const pkiSync = {
    id: "sync-1",
    destinationConfig: { siteId: "222", siteName: "current.example.com" },
    syncOptions: { canRemoveCertificates: true },
    connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
  } as never;

  beforeEach(() => {
    impervaRequest.mockReset();
    impervaRequest.mockResolvedValue({});
  });

  test("deletes the slot on the site the certificate was uploaded to, not the sync's current site", async () => {
    const { factory } = await buildFactory([{ certificateId: "cert-1", externalIdentifier: "111:RSA" }]);

    await factory.removeCertificates(pkiSync, ["leaf"], {
      certificateMap: { leaf: { certificateId: "cert-1" } } as never
    });

    expect(impervaRequest).toHaveBeenCalledTimes(1);
    const request = firstImpervaRequest();
    expect(request.method).toBe("DELETE");
    expect(request.path).toBe("/api/prov/v2/sites/111/customCertificate");
    expect(request.params?.auth_type).toBe(ImpervaCertificateAuthType.Rsa);
  });

  test("cleans up an orphaned slot on its own site during a sync", async () => {
    const { factory, removeCertificatesFromDal } = await buildFactory([
      { certificateId: "cert-1", externalIdentifier: "111:ECC" }
    ]);

    const result = await factory.syncCertificates(pkiSync, {});

    expect(impervaRequest).toHaveBeenCalledTimes(1);
    const request = firstImpervaRequest();
    expect(request.method).toBe("DELETE");
    expect(request.path).toBe("/api/prov/v2/sites/111/customCertificate");
    expect(request.params?.auth_type).toBe(ImpervaCertificateAuthType.Ecc);
    expect(result.removed).toBe(1);
    expect(removeCertificatesFromDal).toHaveBeenCalledWith("sync-1", ["cert-1"]);
  });
});

describe("Imperva failed uploads", () => {
  test("leaves the certificate already serving in place when the upload is rejected", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const { AxiosError } = await import("axios");

    const rejected = new AxiosError("Request failed");
    rejected.response = { status: 400, data: { message: "Invalid input" } } as never;
    impervaRequest.mockReset();
    impervaRequest.mockRejectedValue(rejected);

    const removeCertificatesFromDal = vi.fn();
    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: {
        findByPkiSyncId: vi.fn().mockResolvedValue([{ certificateId: "old", externalIdentifier: "222:RSA" }]),
        removeCertificates: removeCertificatesFromDal,
        addCertificates: vi.fn(),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(undefined),
        updateById: vi.fn(),
        updateSyncStatus: vi.fn(),
        findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set<string>()),
        claimExternalIdentifier: vi.fn()
      } as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    const sync = {
      id: "sync-1",
      destinationConfig: { siteId: "222", siteName: "current.example.com" },
      syncOptions: { canRemoveCertificates: true },
      connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
    } as never;

    await expect(
      factory.syncCertificates(sync, { leaf: { cert: RSA_CERT_PEM, privateKey: "key" } } as never)
    ).rejects.toThrow("Failed to sync certificate to Imperva");

    expect(impervaRequest.mock.calls.every((call) => (call[0] as TRecordedRequest).method !== "DELETE")).toBe(true);
    expect(removeCertificatesFromDal).not.toHaveBeenCalled();
  });
});

describe("Imperva slot ownership", () => {
  const buildSync = (siteId: string) =>
    ({
      id: "sync-1",
      destination: "imperva",
      destinationConfig: { siteId, siteName: "current.example.com" },
      syncOptions: { canRemoveCertificates: true },
      connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
    }) as never;

  const buildDeps = (records: Array<{ certificateId: string; externalIdentifier: string }>, inUse: string[] = []) => {
    const removeCertificatesFromDal = vi.fn();
    const certificateSyncDAL = {
      findByPkiSyncId: vi.fn().mockResolvedValue(records),
      removeCertificates: removeCertificatesFromDal,
      addCertificates: vi.fn(),
      findByPkiSyncAndCertificate: vi.fn().mockResolvedValue({ id: "row-1" }),
      updateById: vi.fn(),
      updateSyncStatus: vi.fn(),
      findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set(inUse)),
      claimExternalIdentifier: vi.fn()
    };
    return { certificateSyncDAL, removeCertificatesFromDal };
  };

  beforeEach(() => {
    impervaRequest.mockReset();
    impervaRequest.mockResolvedValue({});
  });

  test("clears the slot on the website a repointed sync left behind, and keeps the link row", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const { certificateSyncDAL, removeCertificatesFromDal } = buildDeps([
      { certificateId: "cert-1", externalIdentifier: "111:RSA" }
    ]);

    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: certificateSyncDAL as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    await factory.syncCertificates(buildSync("222"), {
      leaf: { cert: RSA_CERT_PEM, privateKey: "key", certificateId: "cert-1" }
    } as never);

    const deletes = impervaRequest.mock.calls
      .map((call) => call[0] as TRecordedRequest)
      .filter((req) => req.method === "DELETE");

    expect(deletes).toHaveLength(1);
    expect(deletes[0].path).toBe("/api/prov/v2/sites/111/customCertificate");
    expect(removeCertificatesFromDal).not.toHaveBeenCalled();
  });

  test("leaves a slot another sync owns alone", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const { certificateSyncDAL, removeCertificatesFromDal } = buildDeps(
      [{ certificateId: "cert-old", externalIdentifier: "222:ECC" }],
      ["222:ECC"]
    );

    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: certificateSyncDAL as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    const result = await factory.syncCertificates(buildSync("222"), {});

    expect(impervaRequest).not.toHaveBeenCalled();
    expect(result.removed).toBeUndefined();
    expect(removeCertificatesFromDal).toHaveBeenCalledWith("sync-1", ["cert-old"]);
  });
});

describe("Imperva deployment mismatch", () => {
  test("keeps the serving certificate when Imperva will not serve the new one", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");

    impervaRequest.mockReset();
    impervaRequest.mockImplementation((args: unknown) => {
      const { method } = args as TRecordedRequest;
      if (method === "GET") {
        return Promise.resolve({
          data: [{ authType: ImpervaCertificateAuthType.Ecc, customCertificateDetails: { hasMismatchSite: true } }]
        });
      }
      return Promise.resolve({});
    });

    const removeCertificates = vi.fn();
    const updateById = vi.fn();
    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: {
        // The RSA slot Imperva is still serving from.
        findByPkiSyncId: vi
          .fn()
          .mockResolvedValue([{ id: "row-0", certificateId: "cert-old", externalIdentifier: "111:RSA" }]),
        removeCertificates,
        addCertificates: vi.fn(),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue({ id: "row-1" }),
        updateById,
        updateSyncStatus: vi.fn(),
        findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set<string>()),
        claimExternalIdentifier: vi.fn()
      } as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    const result = await factory.syncCertificates(
      {
        id: "sync-1",
        destination: "imperva",
        projectId: "project-1",
        destinationConfig: { siteId: "111", siteName: "waf.example.com" },
        syncOptions: { canRemoveCertificates: true },
        connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
      } as never,
      { leaf: { cert: EC_CERT_PEM, privateKey: "key", certificateId: "cert-1" } } as never
    );

    const deletes = impervaRequest.mock.calls
      .map((call) => call[0] as TRecordedRequest)
      .filter((req) => req.method === "DELETE");

    expect(deletes).toHaveLength(0);
    expect(removeCertificates).not.toHaveBeenCalled();
    expect(result.removed).toBeUndefined();
    expect(result.details?.failedUploads).toEqual([
      { name: "leaf", error: expect.stringContaining("does not cover every managed domain") as unknown as string }
    ]);
    expect(result.partialFailureMessage).toContain("does not cover every managed domain");
    expect(updateById.mock.calls[0][1]).toMatchObject({ syncStatus: "failed" });
  });
});

describe("Imperva retry decisions", () => {
  test("stops retrying what Imperva refused, keeps retrying what it could not answer", async () => {
    const { isImpervaRetryable } = await import("./imperva-pki-sync-fns");
    const { ImpervaRequestError } = await import("@app/services/app-connection/imperva/imperva-connection-fns");

    expect(isImpervaRetryable(new ImpervaRequestError({ message: "Invalid input", status: 400 }))).toBe(false);
    expect(isImpervaRetryable(new ImpervaRequestError({ message: "unauthorized", status: 401 }))).toBe(false);
    expect(isImpervaRetryable(new ImpervaRequestError({ message: "rate limited", status: 429 }))).toBe(true);
    expect(isImpervaRetryable(new ImpervaRequestError({ message: "server error", status: 500 }))).toBe(true);
    expect(isImpervaRetryable(new Error("socket hang up"))).toBe(true);
  });

  test("releases the claim when Imperva refuses, and keeps it when the answer is unknown", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const { ImpervaRequestError } = await import("@app/services/app-connection/imperva/imperva-connection-fns");

    const run = async (error: Error, existing: Array<Record<string, unknown>>) => {
      impervaRequest.mockReset();
      impervaRequest.mockRejectedValue(error);
      const removeCertificates = vi.fn();
      const updateById = vi.fn();
      const factory = impervaPkiSyncFactory({
        certificateSyncDAL: {
          findByPkiSyncId: vi.fn().mockResolvedValue(existing),
          removeCertificates,
          addCertificates: vi.fn(),
          findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(undefined),
          updateById,
          updateSyncStatus: vi.fn(),
          findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set<string>()),
          claimExternalIdentifier: vi.fn()
        } as never,
        certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
      });

      await expect(
        factory.syncCertificates(
          {
            id: "sync-1",
            destination: "imperva",
            projectId: "project-1",
            destinationConfig: { siteId: "111", siteName: "waf.example.com" },
            syncOptions: { canRemoveCertificates: true },
            connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
          } as never,
          { leaf: { cert: RSA_CERT_PEM, privateKey: "key", certificateId: "cert-1" } } as never
        )
      ).rejects.toThrow();

      return { removeCertificates, updateById };
    };

    const refused = await run(new ImpervaRequestError({ message: "Invalid input", status: 400 }), []);
    expect(refused.removeCertificates).toHaveBeenCalledWith("sync-1", ["cert-1"]);

    const renewed = await run(new ImpervaRequestError({ message: "Invalid input", status: 400 }), [
      { id: "row-1", certificateId: "cert-1", externalIdentifier: "111:ECC" }
    ]);
    expect(renewed.updateById).toHaveBeenCalledWith("row-1", { externalIdentifier: "111:ECC" });

    const unknown = await run(new Error("socket hang up"), []);
    expect(unknown.removeCertificates).not.toHaveBeenCalled();
  });

  test("marks a refused upload as final rather than retrying it", async () => {
    const { impervaPkiSyncFactory } = await import("./imperva-pki-sync-fns");
    const { ImpervaRequestError } = await import("@app/services/app-connection/imperva/imperva-connection-fns");

    impervaRequest.mockReset();
    impervaRequest.mockRejectedValue(new ImpervaRequestError({ message: "Invalid input", status: 400 }));

    const claimExternalIdentifier = vi.fn();
    const factory = impervaPkiSyncFactory({
      certificateSyncDAL: {
        findByPkiSyncId: vi.fn().mockResolvedValue([]),
        removeCertificates: vi.fn(),
        addCertificates: vi.fn(),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(undefined),
        updateById: vi.fn(),
        updateSyncStatus: vi.fn(),
        findExternalIdentifiersInUse: vi.fn().mockResolvedValue(new Set<string>()),
        claimExternalIdentifier
      } as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });

    await expect(
      factory.syncCertificates(
        {
          id: "sync-1",
          destination: "imperva",
          projectId: "project-1",
          destinationConfig: { siteId: "111", siteName: "waf.example.com" },
          syncOptions: { canRemoveCertificates: true },
          connection: { credentials: { apiId: "id", apiKey: "key" }, gatewayId: null, gatewayPoolId: null }
        } as never,
        { leaf: { cert: RSA_CERT_PEM, privateKey: "key", certificateId: "cert-1" } } as never
      )
    ).rejects.toMatchObject({ shouldRetry: false });

    expect(claimExternalIdentifier).toHaveBeenCalledWith("sync-1", "cert-1", "111:RSA");
  });
});
