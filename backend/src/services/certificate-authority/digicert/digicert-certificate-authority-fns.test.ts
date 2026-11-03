import { CaStatus, CaType } from "../certificate-authority-enums";
import { DigiCertCertificateAuthorityFns } from "./digicert-certificate-authority-fns";

const client = {
  getOrder: vi.fn(),
  reissueOrder: vi.fn(),
  downloadCertificatePem: vi.fn(),
  cancelOrderReissue: vi.fn()
};

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./digicert-api-client", () => ({ createDigiCertApiClient: () => client }));
vi.mock("./digicert-certificate-authority-shared", () => ({
  castDbEntryToDigiCertCertificateAuthority: () => ({
    id: "ca-1",
    status: CaStatus.ACTIVE,
    configuration: { appConnectionId: "connection-1", organizationId: 777, productNameId: "ssl_basic" }
  }),
  getDigiCertClientCredentials: vi.fn().mockResolvedValue({ apiKey: "key", baseUrl: "https://digicert.example" }),
  extractLeafAndChain: vi.fn()
}));

const CA_ID = "ca-1";
const ORDER_ID = 7001;
const CURRENT_CERTIFICATE_ID = 50001;
const ORIGINAL_CERTIFICATE_ID = "00000000-0000-4000-8000-000000000001";
const CSR = "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----";

const buildFns = (storedCertificateId: number) => {
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue({
      id: ORIGINAL_CERTIFICATE_ID,
      serialNumber: "0a1b",
      externalMetadata: { type: CaType.DIGICERT, orderId: ORDER_ID, certificateId: storedCertificateId }
    }),
    updateById: vi.fn()
  };
  const certificateAuthorityDAL = {
    findByIdWithAssociatedCa: vi.fn().mockResolvedValue({ id: CA_ID, externalCa: { type: CaType.DIGICERT } })
  };
  return DigiCertCertificateAuthorityFns({
    certificateDAL,
    certificateAuthorityDAL
  } as unknown as Parameters<typeof DigiCertCertificateAuthorityFns>[0]);
};

const reissue = (fns: ReturnType<typeof buildFns>) =>
  fns.reissueCertificate({
    caId: CA_ID,
    orderId: ORDER_ID,
    originalCertificateId: ORIGINAL_CERTIFICATE_ID,
    commonName: "example.com",
    altNames: ["example.com", "www.example.com"],
    csr: CSR,
    ttl: "90d"
  });

describe("DigiCert reissueCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getOrder.mockResolvedValue({
      id: ORDER_ID,
      status: "issued",
      certificate: { id: CURRENT_CERTIFICATE_ID },
      organization: { id: 777 },
      product: { name_id: "ssl_basic" }
    });
    client.reissueOrder.mockResolvedValue({ id: ORDER_ID });
  });

  test("reissues the original certificate's order with its validity", async () => {
    await reissue(buildFns(CURRENT_CERTIFICATE_ID));

    expect(client.reissueOrder).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({
        certificate: expect.objectContaining({
          common_name: "example.com",
          dns_names: ["www.example.com"],
          cert_validity: { days: 90 }
        }) as object
      })
    );
  });

  test("refuses to reissue a certificate that is no longer the order's current certificate", async () => {
    await expect(reissue(buildFns(CURRENT_CERTIFICATE_ID - 1))).rejects.toThrow(
      `This certificate is no longer the current one on DigiCert order ${ORDER_ID}`
    );
    expect(client.reissueOrder).not.toHaveBeenCalled();
  });
});

const ORDER_METADATA = {
  orderId: ORDER_ID,
  productNameId: "ssl_basic",
  organizationId: 777,
  orderPlacedAt: "2026-11-01T00:00:00.000Z"
};

describe("DigiCert cancelPendingRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.cancelOrderReissue.mockResolvedValue(undefined);
  });

  test("cancels the reissue on DigiCert for a reissue request", async () => {
    const metadata = JSON.stringify({ digicert: { ...ORDER_METADATA, previousCertificateId: CURRENT_CERTIFICATE_ID } });

    await expect(buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })).resolves.toBe(true);
    expect(client.cancelOrderReissue).toHaveBeenCalledWith(ORDER_ID, expect.any(String));
  });

  test("does nothing for a new order", async () => {
    const metadata = JSON.stringify({ digicert: ORDER_METADATA });

    await expect(buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })).resolves.toBe(false);
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });

  test("does nothing when the metadata is missing or not JSON", async () => {
    const fns = buildFns(CURRENT_CERTIFICATE_ID);

    await expect(fns.cancelPendingRequest({ caId: CA_ID, metadata: null })).resolves.toBe(false);
    await expect(fns.cancelPendingRequest({ caId: CA_ID, metadata: "not json" })).resolves.toBe(false);
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });
});
