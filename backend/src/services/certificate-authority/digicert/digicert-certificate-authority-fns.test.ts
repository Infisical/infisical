import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { CrlReason } from "@app/services/certificate/certificate-types";

import { AcmeDnsProvider } from "../acme/acme-certificate-authority-enums";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { DigiCertCertificateAuthorityFns } from "./digicert-certificate-authority-fns";

const client = {
  placeOrder: vi.fn(),
  getOrder: vi.fn(),
  reissueOrder: vi.fn(),
  downloadCertificatePem: vi.fn(),
  cancelOrderReissue: vi.fn(),
  revokeCertificate: vi.fn(),
  revokeOrder: vi.fn()
};

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./digicert-api-client", () => ({
  createDigiCertApiClient: () => client,
  DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS: 20_000
}));
vi.mock("../dns-providers/dns-txt-records", () => ({
  DNS_TXT_RECORD_PROVIDERS: new Proxy(
    {},
    {
      get: () => ({
        getZone: async (_connection: unknown, id: string) => ({
          id: id.toLowerCase(),
          name: id.toLowerCase().startsWith("zone-b") ? "example.org" : "example.com"
        })
      })
    }
  )
}));
vi.mock("@app/services/app-connection/digicert/digicert-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listDigiCertProducts: async () => [
    { nameId: "ssl_basic", name: "Basic OV", type: "ssl_certificate" },
    { nameId: "ds_org", name: "Document Signing for Organization", type: "document_signing" }
  ]
}));
vi.mock("./digicert-certificate-authority-shared", () => ({
  castDbEntryToDigiCertCertificateAuthority: (row?: { cast?: unknown }) =>
    row?.cast ?? {
      id: "ca-1",
      status: CaStatus.ACTIVE,
      configuration: { appConnectionId: "connection-1", organizationId: 777, productNameId: "ssl_basic" }
    },
  getDigiCertClientCredentials: vi.fn().mockResolvedValue({ apiKey: "key", baseUrl: "https://digicert.example" }),
  extractLeafAndChain: (pem: string) => ({ leaf: pem, chain: "" })
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
    findOneLiveFirst: vi.fn().mockResolvedValue({
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
    certificateAuthorityDAL,
    certificateBodyDAL: {
      findOne: vi.fn().mockResolvedValue({ encryptedCertificate: Buffer.from(storedCertificate.rawData) })
    },
    kmsDataKeyService: { getProjectCertificateKmsKeyId: vi.fn().mockResolvedValue("kms-1") },
    kmsKeyService: {
      decryptWithKmsKey: vi.fn().mockResolvedValue(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    }
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

  test("validates domains before handing off the reissue and submitting it", async () => {
    const calls: string[] = [];
    client.reissueOrder.mockImplementation(async () => {
      calls.push("reissueOrder");
      return { id: ORDER_ID };
    });
    await buildFns(CURRENT_CERTIFICATE_ID).reissueCertificate({
      caId: CA_ID,
      orderId: ORDER_ID,
      originalCertificateId: ORIGINAL_CERTIFICATE_ID,
      commonName: "example.com",
      altNames: ["example.com", "www.example.com"],
      csr: CSR,
      ttl: "90d",
      onBeforeOrder: async ({ dnsNames }) => {
        calls.push(`onBeforeOrder:${dnsNames.join(",")}`);
      },
      onBeforeSubmit: async () => {
        calls.push("onBeforeSubmit");
      }
    });
    expect(calls).toEqual(["onBeforeOrder:example.com,www.example.com", "onBeforeSubmit", "reissueOrder"]);
  });

  test("refuses to reissue when the order's certificate changed during domain validation", async () => {
    const onBeforeSubmit = vi.fn();
    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).reissueCertificate({
        caId: CA_ID,
        orderId: ORDER_ID,
        originalCertificateId: ORIGINAL_CERTIFICATE_ID,
        commonName: "example.com",
        csr: CSR,
        ttl: "90d",
        onBeforeOrder: async () => {
          client.getOrder.mockResolvedValue({
            id: ORDER_ID,
            status: "issued",
            certificate: { id: CURRENT_CERTIFICATE_ID + 1 },
            organization: { id: 777 },
            product: { name_id: "ssl_basic" }
          });
        },
        onBeforeSubmit
      })
    ).rejects.toThrow(`DigiCert order ${ORDER_ID} changed while its domains were being validated`);
    expect(onBeforeSubmit).not.toHaveBeenCalled();
    expect(client.reissueOrder).not.toHaveBeenCalled();
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

describe("DigiCert orderCertificate", () => {
  test("validates domains before placing the order", async () => {
    const calls: string[] = [];
    client.placeOrder.mockImplementation(async () => {
      calls.push("placeOrder");
      return { id: ORDER_ID };
    });
    await buildFns(CURRENT_CERTIFICATE_ID).orderCertificate({
      caId: CA_ID,
      commonName: "example.com",
      altNames: ["example.com", "www.example.com"],
      csr: CSR,
      ttl: "90d",
      onBeforeOrder: async ({ dnsNames }) => {
        calls.push(`onBeforeOrder:${dnsNames.join(",")}`);
      }
    });
    expect(calls).toEqual(["onBeforeOrder:example.com,www.example.com", "placeOrder"]);
  });
});

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

describe("DigiCert revokeCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.revokeCertificate.mockResolvedValue({ id: 9001, status: "pending" });
  });

  it("sends a plain revoke without skipping approval and succeeds while the request waits", async () => {
    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).revokeCertificate({
        caId: CA_ID,
        serialNumber: "0a1b",
        reason: CrlReason.SUPERSEDED
      })
    ).resolves.toBeUndefined();
    expect(client.revokeCertificate).toHaveBeenCalledWith(CURRENT_CERTIFICATE_ID, expect.any(String), {
      skipApproval: false
    });
  });

  it("skips approval and returns the pending request id only when the caller allows a pending approval", async () => {
    await expect(
      buildFns(CURRENT_CERTIFICATE_ID).revokeCertificate({
        caId: CA_ID,
        serialNumber: "0a1b",
        reason: CrlReason.SUPERSEDED,
        allowPendingApproval: true
      })
    ).resolves.toBe(9001);
    expect(client.revokeCertificate).toHaveBeenCalledWith(CURRENT_CERTIFICATE_ID, expect.any(String), {
      skipApproval: true
    });
  });
});

describe("DigiCert createCertificateAuthority", () => {
  test("rejects a DNS zone whose connection is not the app its provider needs", async () => {
    const appConnectionDAL = {
      findById: vi.fn(async (id: string) => ({
        id,
        app: id === "digicert-connection" ? AppConnection.DigiCert : AppConnection.AWS
      }))
    };
    const certificateAuthorityDAL = { transaction: vi.fn() };
    const fns = DigiCertCertificateAuthorityFns({
      appConnectionDAL,
      certificateAuthorityDAL,
      appConnectionService: { validateAppConnectionUsageById: vi.fn(async () => ({})) }
    } as unknown as Parameters<typeof DigiCertCertificateAuthorityFns>[0]);

    await expect(
      fns.createCertificateAuthority({
        name: "digicert-ca",
        projectId: "project-1",
        status: CaStatus.ACTIVE,
        actor: {
          type: ActorType.USER,
          id: "user-1",
          authMethod: AuthMethod.EMAIL,
          orgId: "org-1",
          rootOrgId: "org-1",
          parentOrgId: "org-1"
        },
        configuration: {
          appConnectionId: "digicert-connection",
          organizationId: 777,
          productNameId: "ssl_basic",
          dnsZones: [
            { provider: AcmeDnsProvider.Cloudflare, appConnectionId: "aws-connection", hostedZoneId: "zone-1" }
          ]
        }
      })
    ).rejects.toThrow(BadRequestError);
    expect(certificateAuthorityDAL.transaction).not.toHaveBeenCalled();
  });
});

describe("DigiCert CA DNS zones", () => {
  const actor = {
    type: ActorType.USER,
    id: "user-1",
    authMethod: AuthMethod.EMAIL,
    orgId: "org-1",
    rootOrgId: "org-1",
    parentOrgId: "org-1"
  };
  const storedZone = {
    provider: AcmeDnsProvider.Cloudflare,
    appConnectionId: "cf-connection",
    hostedZoneId: "zone-a",
    zoneName: "example.com"
  };

  let storedDnsZonesInTx: unknown[] = [];
  const lockedRowWhere = vi.fn();
  const lockedRowForUpdate = vi.fn();

  const buildZoneFns = () => {
    const externalCertificateAuthorityDAL = { create: vi.fn(), update: vi.fn() };
    const stored = {
      cast: {
        id: CA_ID,
        projectId: "project-1",
        status: CaStatus.ACTIVE,
        configuration: {
          appConnectionId: "digicert-connection",
          organizationId: 777,
          productNameId: "ssl_basic",
          dnsZones: [storedZone]
        }
      },
      externalCa: { id: "external-1" }
    };
    const certificateAuthorityDAL = {
      findByIdWithAssociatedCa: vi.fn(async () => stored),
      create: vi.fn(async () => ({ id: CA_ID })),
      updateById: vi.fn(),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const lockedRow = {
          configuration: { ...stored.cast.configuration, dnsZones: storedDnsZonesInTx }
        };
        const query = { where: lockedRowWhere, forUpdate: lockedRowForUpdate, first: async () => lockedRow };
        lockedRowWhere.mockReturnValue(query);
        lockedRowForUpdate.mockReturnValue(query);
        return callback(() => query);
      })
    };
    const fns = DigiCertCertificateAuthorityFns({
      appConnectionDAL: {
        findById: vi.fn(async (id: string) => ({
          id: id.toLowerCase(),
          app: id.toLowerCase().startsWith("digicert") ? AppConnection.DigiCert : AppConnection.Cloudflare
        }))
      },
      certificateAuthorityDAL,
      externalCertificateAuthorityDAL,
      appConnectionService: { validateAppConnectionUsageById: vi.fn(async () => ({})) }
    } as unknown as Parameters<typeof DigiCertCertificateAuthorityFns>[0]);
    const storedDnsZones = () =>
      (externalCertificateAuthorityDAL.update.mock.calls[0][1] as { configuration: { dnsZones?: unknown } })
        .configuration.dnsZones;
    return { fns, storedDnsZones };
  };

  const update = (fns: ReturnType<typeof buildZoneFns>["fns"], configuration: Record<string, unknown>) =>
    fns.updateCertificateAuthority({
      id: CA_ID,
      actor,
      configuration: {
        appConnectionId: "digicert-connection",
        organizationId: 777,
        productNameId: "ssl_basic",
        ...configuration
      }
    } as Parameters<typeof fns.updateCertificateAuthority>[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    storedDnsZonesInTx = [storedZone];
  });

  test("keeps the linked zones when an update leaves dnsZones out", async () => {
    const { fns, storedDnsZones } = buildZoneFns();
    await update(fns, {});
    expect(storedDnsZones()).toEqual([storedZone]);
  });

  test("keeps the zones committed at write time, not the ones read before it, when dnsZones is left out", async () => {
    storedDnsZonesInTx = [];
    const { fns, storedDnsZones } = buildZoneFns();
    await update(fns, {});
    expect(storedDnsZones()).toEqual([]);
    expect(lockedRowWhere).toHaveBeenCalledWith({ caId: CA_ID, type: CaType.DIGICERT });
    expect(lockedRowForUpdate).toHaveBeenCalled();
  });

  test("drops the linked zones when an update switches the CA to code signing", async () => {
    const { fns, storedDnsZones } = buildZoneFns();
    await update(fns, { productNameId: "code_signing", purpose: "code_signing" });
    expect(storedDnsZones()).toBeUndefined();
  });

  test("unlinks every zone when an update sends an empty list", async () => {
    const { fns, storedDnsZones } = buildZoneFns();
    await update(fns, { dnsZones: [] });
    expect(storedDnsZones()).toEqual([]);
  });

  test("stores the provider's zone ID and the connection's own ID, not the spelling sent", async () => {
    const { fns, storedDnsZones } = buildZoneFns();
    await update(fns, {
      dnsZones: [{ provider: AcmeDnsProvider.Cloudflare, appConnectionId: "CF-CONNECTION", hostedZoneId: "ZONE-A" }]
    });
    expect(storedDnsZones()).toEqual([storedZone]);
  });

  test("rejects two entries that resolve to the same zone", async () => {
    const { fns } = buildZoneFns();
    await expect(
      update(fns, {
        dnsZones: [
          { provider: AcmeDnsProvider.Cloudflare, appConnectionId: "cf-connection", hostedZoneId: "zone-a" },
          { provider: AcmeDnsProvider.Cloudflare, appConnectionId: "cf-connection", hostedZoneId: "ZONE-A" }
        ]
      })
    ).rejects.toThrow("DNS zone 'example.com' is linked more than once");
  });

  test("rejects DNS zones on a CA whose product isn't a TLS product", async () => {
    const { fns } = buildZoneFns();
    await expect(
      update(fns, {
        productNameId: "ds_org",
        dnsZones: [{ provider: AcmeDnsProvider.Cloudflare, appConnectionId: "cf-connection", hostedZoneId: "zone-a" }]
      })
    ).rejects.toThrow("product 'ds_org' isn't a TLS product");
  });

  test("rejects switching a CA with linked zones to a product that isn't a TLS product", async () => {
    const { fns } = buildZoneFns();
    await expect(update(fns, { productNameId: "ds_org" })).rejects.toThrow("product 'ds_org' isn't a TLS product");
  });

  test("rejects DNS zones on a code-signing CA", async () => {
    const { fns } = buildZoneFns();
    await expect(
      update(fns, {
        productNameId: "code_signing",
        purpose: "code_signing",
        dnsZones: [{ provider: AcmeDnsProvider.Cloudflare, appConnectionId: "cf-connection", hostedZoneId: "zone-a" }]
      })
    ).rejects.toThrow(BadRequestError);
  });
});
