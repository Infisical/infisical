import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

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
  extractLeafAndChain: (pem: string) => ({ leaf: pem, chain: "" })
}));
vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-1")
}));

const createCertificate = async (name: string) => {
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const keys = (await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"])) as CryptoKeyPair;
  return x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "0a1b",
    name,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: algorithm,
    keys
  });
};

let digicertCertificate: x509.X509Certificate;
let forgedCertificate: x509.X509Certificate;

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  digicertCertificate = await createCertificate("CN=example.com");
  forgedCertificate = await createCertificate("CN=example.com");
});

const CA_ID = "ca-1";
const ORDER_ID = 7001;
const CURRENT_CERTIFICATE_ID = 50001;
const ORIGINAL_CERTIFICATE_ID = "00000000-0000-4000-8000-000000000001";
const CSR = "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----";

const buildFns = (storedCertificateId: number, storedCertificate = digicertCertificate) => {
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue({
      id: ORIGINAL_CERTIFICATE_ID,
      projectId: "project-1",
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
    certificateAuthorityDAL,
    certificateBodyDAL: {
      findOne: vi.fn().mockResolvedValue({ encryptedCertificate: Buffer.from(storedCertificate.rawData) })
    },
    kmsService: {
      decryptWithKmsKey: vi.fn().mockResolvedValue(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    },
    projectDAL: {}
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
    client.downloadCertificatePem.mockResolvedValue(digicertCertificate.toString("pem"));
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

  test("refuses a stored certificate that only shares its serial with DigiCert's certificate", async () => {
    await expect(reissue(buildFns(CURRENT_CERTIFICATE_ID, forgedCertificate))).rejects.toThrow(
      `This certificate doesn't match the one DigiCert issued on order ${ORDER_ID}`
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
  const reissueMetadata = JSON.stringify({
    digicert: { ...ORDER_METADATA, previousCertificateId: CURRENT_CERTIFICATE_ID }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    client.cancelOrderReissue.mockResolvedValue(undefined);
    client.getOrder.mockResolvedValue({
      id: ORDER_ID,
      status: "reissue_pending",
      certificate: { id: CURRENT_CERTIFICATE_ID },
      organization: { id: 777 },
      product: { name_id: "ssl_basic" }
    });
  });

  test("cancels the reissue on DigiCert for a reissue request", async () => {
    const metadata = JSON.stringify({ digicert: { ...ORDER_METADATA, previousCertificateId: CURRENT_CERTIFICATE_ID } });

    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })
    ).resolves.toBeUndefined();
    expect(client.cancelOrderReissue).toHaveBeenCalledWith(ORDER_ID, expect.any(String));
  });

  test("does nothing for a new order", async () => {
    const metadata = JSON.stringify({ digicert: ORDER_METADATA });

    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })
    ).resolves.toBeUndefined();
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });

  test("does nothing when the metadata is missing or not JSON", async () => {
    const fns = buildFns(CURRENT_CERTIFICATE_ID);

    await expect(fns.cancelPendingRequest({ caId: CA_ID, metadata: null })).resolves.toBeUndefined();
    await expect(fns.cancelPendingRequest({ caId: CA_ID, metadata: "not json" })).resolves.toBeUndefined();
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });

  test("refuses when DigiCert does not confirm the cancellation", async () => {
    client.cancelOrderReissue.mockRejectedValue(new Error("no response"));
    const metadata = JSON.stringify({ digicert: { ...ORDER_METADATA, previousCertificateId: CURRENT_CERTIFICATE_ID } });

    await expect(buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })).rejects.toThrow(
      `DigiCert didn't cancel the reissue on order ${ORDER_ID}`
    );
  });

  test("refuses when DigiCert already issued the reissue", async () => {
    client.getOrder.mockResolvedValue({
      id: ORDER_ID,
      status: "issued",
      certificate: { id: CURRENT_CERTIFICATE_ID + 1 },
      organization: { id: 777 },
      product: { name_id: "ssl_basic" }
    });

    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata: reissueMetadata })
    ).rejects.toThrow(`DigiCert already issued the reissue on order ${ORDER_ID}`);
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });

  test("refuses when DigiCert can't be reached", async () => {
    client.getOrder.mockRejectedValue(new Error("no response"));

    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata: reissueMetadata })
    ).rejects.toThrow("so the request is still open");
    expect(client.cancelOrderReissue).not.toHaveBeenCalled();
  });

  test("cancels using the organization and product saved with the request, not the CA's current ones", async () => {
    client.getOrder.mockResolvedValue({
      id: ORDER_ID,
      status: "reissue_pending",
      certificate: { id: CURRENT_CERTIFICATE_ID },
      organization: { id: 888 },
      product: { name_id: "ssl_basic" }
    });
    const metadata = JSON.stringify({
      digicert: { ...ORDER_METADATA, organizationId: 888, previousCertificateId: CURRENT_CERTIFICATE_ID }
    });

    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).cancelPendingRequest({ caId: CA_ID, metadata })
    ).resolves.toBeUndefined();
    expect(client.cancelOrderReissue).toHaveBeenCalledWith(ORDER_ID, expect.any(String));
  });
});
