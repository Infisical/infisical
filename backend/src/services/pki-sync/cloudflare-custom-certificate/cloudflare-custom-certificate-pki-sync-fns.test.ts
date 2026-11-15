import { CloudflareBundleMethod } from "./cloudflare-custom-certificate-pki-sync-constants";
import { buildCloudflareCertificateBundle } from "./cloudflare-custom-certificate-pki-sync-fns";

const pem = (label: string) => `-----BEGIN CERTIFICATE-----\n${label}\n-----END CERTIFICATE-----`;

const LEAF = pem("leaf");
const INTERMEDIATE = pem("intermediate");
const ROOT = pem("root");

describe("Cloudflare certificate bundle", () => {
  test("uses force with the root appended for an Infisical CA certificate by default", () => {
    expect(
      buildCloudflareCertificateBundle({ cert: LEAF, certificateChain: INTERMEDIATE, caCertificate: ROOT })
    ).toEqual({
      bundleMethod: CloudflareBundleMethod.Force,
      certificate: `${INTERMEDIATE}\n${ROOT}\n${LEAF}`
    });
  });

  test("does not append a root the chain already ends with", () => {
    expect(
      buildCloudflareCertificateBundle({
        cert: LEAF,
        certificateChain: `${INTERMEDIATE}\n${ROOT}`,
        caCertificate: ROOT
      }).certificate
    ).toBe(`${INTERMEDIATE}\n${ROOT}\n${LEAF}`);
  });

  test("uses ubiquitous with the leaf first for an imported certificate by default", () => {
    expect(buildCloudflareCertificateBundle({ cert: LEAF, certificateChain: INTERMEDIATE })).toEqual({
      bundleMethod: CloudflareBundleMethod.Ubiquitous,
      certificate: `${LEAF}\n${INTERMEDIATE}`
    });
  });

  test("puts the stored chain first and adds no root for an imported certificate with force", () => {
    expect(
      buildCloudflareCertificateBundle({
        cert: LEAF,
        certificateChain: INTERMEDIATE,
        bundleMethod: CloudflareBundleMethod.Force
      })
    ).toEqual({
      bundleMethod: CloudflareBundleMethod.Force,
      certificate: `${INTERMEDIATE}\n${LEAF}`
    });
  });

  test("uploads the leaf alone with force when there is no chain", () => {
    expect(buildCloudflareCertificateBundle({ cert: LEAF, bundleMethod: CloudflareBundleMethod.Force })).toEqual({
      bundleMethod: CloudflareBundleMethod.Force,
      certificate: LEAF
    });
  });

  test("honours an explicit optimal method over the Infisical CA default", () => {
    expect(
      buildCloudflareCertificateBundle({
        cert: LEAF,
        certificateChain: INTERMEDIATE,
        caCertificate: ROOT,
        bundleMethod: CloudflareBundleMethod.Optimal
      })
    ).toEqual({
      bundleMethod: CloudflareBundleMethod.Optimal,
      certificate: `${LEAF}\n${INTERMEDIATE}`
    });
  });
});

const cloudflareRequest = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock("@app/lib/config/request", () => ({ request: cloudflareRequest }));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe("Cloudflare certificate upload", () => {
  const buildFactory = async (records: Array<{ certificateId: string; externalIdentifier: string }>) => {
    const { cloudflareCustomCertificatePkiSyncFactory } = await import("./cloudflare-custom-certificate-pki-sync-fns");

    return cloudflareCustomCertificatePkiSyncFactory({
      certificateSyncDAL: {
        findByPkiSyncId: vi.fn().mockResolvedValue(records),
        removeCertificates: vi.fn(),
        addCertificates: vi.fn(),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(undefined),
        updateById: vi.fn(),
        updateSyncStatus: vi.fn()
      } as never,
      certificateDAL: { findById: vi.fn().mockResolvedValue(undefined) } as never
    });
  };

  const pkiSync = {
    id: "sync-1",
    destinationConfig: { zoneId: "zone-1" },
    syncOptions: { canRemoveCertificates: false, bundleMethod: CloudflareBundleMethod.Force },
    connection: { credentials: { apiToken: "token" } }
  } as never;

  const certificateMap = {
    leaf: {
      cert: LEAF,
      privateKey: "-----BEGIN PRIVATE KEY-----",
      certificateChain: INTERMEDIATE,
      certificateId: "cert-1"
    }
  } as never;

  beforeEach(() => {
    Object.values(cloudflareRequest).forEach((fn) => fn.mockReset());
    cloudflareRequest.post.mockResolvedValue({ data: { result: { id: "cf-new" } } });
    cloudflareRequest.patch.mockResolvedValue({ data: { result: { id: "cf-existing" } } });
  });

  test("sends the configured bundle method when creating a certificate", async () => {
    cloudflareRequest.get.mockResolvedValue({ data: { result: [], result_info: { total_pages: 1 } } });
    const factory = await buildFactory([]);

    await factory.syncCertificates(pkiSync, certificateMap);

    expect(cloudflareRequest.post).toHaveBeenCalledTimes(1);
    expect(cloudflareRequest.post.mock.calls[0][1]).toMatchObject({
      certificate: `${INTERMEDIATE}\n${LEAF}`,
      bundle_method: CloudflareBundleMethod.Force
    });
  });

  test("sends the configured bundle method when updating a certificate", async () => {
    cloudflareRequest.get.mockResolvedValue({
      data: { result: [{ id: "cf-existing" }], result_info: { total_pages: 1 } }
    });
    const factory = await buildFactory([{ certificateId: "cert-1", externalIdentifier: "cf-existing" }]);

    await factory.syncCertificates(pkiSync, certificateMap);

    expect(cloudflareRequest.post).not.toHaveBeenCalled();
    expect(cloudflareRequest.patch).toHaveBeenCalledTimes(1);
    expect(cloudflareRequest.patch.mock.calls[0][1]).toMatchObject({
      certificate: `${INTERMEDIATE}\n${LEAF}`,
      bundle_method: CloudflareBundleMethod.Force
    });
  });
});
