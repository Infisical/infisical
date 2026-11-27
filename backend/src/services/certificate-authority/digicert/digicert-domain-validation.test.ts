import { AcmeDnsProvider } from "../acme/acme-certificate-authority-enums";
import { TDigiCertApiClient } from "./digicert-api-client";
import { DigiCertDomainValidationStatus, DigiCertDomainValidationType } from "./digicert-certificate-authority-enums";
import { TDigiCertCertificateAuthority, TDigiCertDomain } from "./digicert-certificate-authority-types";
import { digiCertDomainValidationFactory } from "./digicert-domain-validation";

const { cloudflareUpsertTxtRecord, route53UpsertTxtRecord } = vi.hoisted(() => ({
  cloudflareUpsertTxtRecord: vi.fn(),
  route53UpsertTxtRecord: vi.fn()
}));

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/delay", () => ({
  delay: () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve);
    })
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (connection: unknown) => connection
}));
vi.mock("../dns-providers/dns-txt-records", async () => {
  const { AcmeDnsProvider: Provider } = await import("../acme/acme-certificate-authority-enums");
  return {
    DNS_TXT_RECORD_PROVIDERS: {
      [Provider.Cloudflare]: { upsertTxtRecord: cloudflareUpsertTxtRecord },
      [Provider.Route53]: { upsertTxtRecord: route53UpsertTxtRecord }
    }
  };
});

const ORGANIZATION_ID = 777;
const PRIVACY_URI = "privacy-uri-1";
const NEW_DOMAIN_ID = 99;

const EXAMPLE_COM_ZONE = {
  provider: AcmeDnsProvider.Cloudflare,
  appConnectionId: "dns-connection-1",
  hostedZoneId: "zone-1",
  zoneName: "example.com"
};

let digicertDomains: TDigiCertDomain[];

const activateValidations = (domainId: number) => {
  digicertDomains = digicertDomains.map((domain) =>
    domain.id === domainId
      ? {
          ...domain,
          is_active: true,
          validations: [{ type: DigiCertDomainValidationType.Ov, status: DigiCertDomainValidationStatus.Active }]
        }
      : domain
  );
};

const client = {
  listDomains: vi.fn(),
  addDomain: vi.fn(),
  activateDomain: vi.fn(),
  submitDomainValidation: vi.fn(),
  setDomainDcvMethod: vi.fn(),
  validateDomainDcv: vi.fn()
};

const heldLocks = new Set<string>();
const keyStore = {
  acquireLock: vi.fn(async ([key]: string[]) => {
    if (heldLocks.has(key)) throw new Error("lock is held");
    heldLocks.add(key);
    return { release: async () => heldLocks.delete(key) };
  })
};

const onProgress = vi.fn();

const validateDomains = ({
  dnsNames,
  dnsZones = [EXAMPLE_COM_ZONE],
  productNameId = "ssl_basic",
  organizationId = ORGANIZATION_ID,
  isCancelled = async () => false
}: {
  dnsNames: string[];
  dnsZones?: (typeof EXAMPLE_COM_ZONE)[];
  productNameId?: string;
  organizationId?: number;
  isCancelled?: () => Promise<boolean>;
}) =>
  digiCertDomainValidationFactory({
    appConnectionDAL: { findById: vi.fn(async (id: string) => ({ id })) },
    kmsDataKeyService: {},
    keyStore
  } as unknown as Parameters<typeof digiCertDomainValidationFactory>[0]).validateDomainsBeforeOrder({
    digicertCa: {
      id: "ca-1",
      configuration: { organizationId, productNameId, dnsZones }
    } as unknown as TDigiCertCertificateAuthority,
    client: client as unknown as TDigiCertApiClient,
    dnsNames,
    onProgress,
    isCancelled
  });

describe("DigiCert domain validation before an order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloudflareUpsertTxtRecord.mockReset();
    route53UpsertTxtRecord.mockReset();
    heldLocks.clear();
    digicertDomains = [];
    client.listDomains.mockImplementation(async () => structuredClone(digicertDomains));
    client.addDomain.mockImplementation(async ({ name }: { name: string }) => {
      digicertDomains.push({ id: NEW_DOMAIN_ID + digicertDomains.length, name, is_active: true, validations: [] });
      return { id: NEW_DOMAIN_ID + digicertDomains.length - 1, dcv_token: { privacy_uri: PRIVACY_URI } };
    });
    client.setDomainDcvMethod.mockResolvedValue({ dcv_token: { privacy_uri: PRIVACY_URI } });
    client.validateDomainDcv.mockImplementation(async (domainId: number) => {
      activateValidations(domainId);
      return DigiCertDomainValidationStatus.Active;
    });
  });

  test("does nothing when the CA links no DNS zones", async () => {
    await expect(validateDomains({ dnsNames: ["example.com"], dnsZones: [] })).resolves.toEqual([]);
    expect(client.listDomains).not.toHaveBeenCalled();
  });

  test("skips names DigiCert already validated, including through a parent domain", async () => {
    digicertDomains = [{ id: 1, name: "example.com", is_active: true, validations: [] }];
    activateValidations(1);

    await expect(validateDomains({ dnsNames: ["shop.example.com", "*.example.com"] })).resolves.toEqual([]);
    expect(client.addDomain).not.toHaveBeenCalled();
    expect(cloudflareUpsertTxtRecord).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  test("validates a domain again for an EV product when DigiCert holds only an OV validation", async () => {
    digicertDomains = [{ id: 1, name: "example.com", is_active: true, validations: [] }];
    activateValidations(1);

    await expect(validateDomains({ dnsNames: ["example.com"], productNameId: "ssl_ev_basic" })).resolves.toEqual([]);
    expect(client.submitDomainValidation).toHaveBeenCalledWith(1, DigiCertDomainValidationType.Ev);
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
  });

  test("adds a new domain, writes its persistent DNS TXT record and retries until DigiCert validates it", async () => {
    client.validateDomainDcv.mockResolvedValueOnce(DigiCertDomainValidationStatus.Pending);

    await expect(validateDomains({ dnsNames: ["www.example.com"] })).resolves.toEqual([]);
    expect(client.addDomain).toHaveBeenCalledWith(expect.objectContaining({ name: "example.com" }));
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fqdn: "_validation-persist.example.com",
        value: expect.stringContaining(PRIVACY_URI) as string
      }),
      expect.anything()
    );
    expect(client.validateDomainDcv).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("example.com"));
  });

  test("validates only the linked name when the request also names a domain in no linked zone", async () => {
    await expect(validateDomains({ dnsNames: ["www.example.com", "other.net"] })).resolves.toEqual([]);
    expect(client.addDomain).toHaveBeenCalledTimes(1);
    expect(client.addDomain).toHaveBeenCalledWith(expect.objectContaining({ name: "example.com" }));
  });

  test("validates through the most specific linked zone", async () => {
    const devZone = {
      provider: AcmeDnsProvider.Route53,
      appConnectionId: "dns-connection-2",
      hostedZoneId: "zone-2",
      zoneName: "dev.example.com"
    };

    await expect(
      validateDomains({ dnsNames: ["api.dev.example.com"], dnsZones: [EXAMPLE_COM_ZONE, devZone] })
    ).resolves.toEqual([]);
    expect(client.addDomain).toHaveBeenCalledWith(expect.objectContaining({ name: "dev.example.com" }));
    expect(route53UpsertTxtRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ zoneId: "zone-2", fqdn: "_validation-persist.dev.example.com" }),
      expect.anything()
    );
    expect(cloudflareUpsertTxtRecord).not.toHaveBeenCalled();
  });

  test("writes the record again for a lapsed domain without adding it to DigiCert again", async () => {
    digicertDomains = [
      {
        id: 5,
        name: "example.com",
        is_active: false,
        validations: [{ type: DigiCertDomainValidationType.Ov, status: "expired" as DigiCertDomainValidationStatus }]
      }
    ];

    await expect(validateDomains({ dnsNames: ["example.com"] })).resolves.toEqual([]);
    expect(client.addDomain).not.toHaveBeenCalled();
    expect(client.activateDomain).toHaveBeenCalledWith(5);
    expect(client.setDomainDcvMethod).toHaveBeenCalledWith(5);
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
    expect(client.validateDomainDcv).toHaveBeenCalledWith(5);
  });

  test("writes the record once when two requests validate the same domain at once", async () => {
    await expect(
      Promise.all([validateDomains({ dnsNames: ["example.com"] }), validateDomains({ dnsNames: ["www.example.com"] })])
    ).resolves.toEqual([[], []]);
    expect(client.addDomain).toHaveBeenCalledTimes(1);
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
  });

  test("validates other zones while one zone's lock is held by another request", async () => {
    let now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      now += 5_000;
      return now;
    });
    const lockAvailable = keyStore.acquireLock.getMockImplementation();
    let heldLockAttempts = 0;
    keyStore.acquireLock.mockImplementation(async (keys: string[]) => {
      if (keys[0].includes("example.com")) {
        heldLockAttempts += 1;
        throw new Error("lock is held");
      }
      return lockAvailable!(keys);
    });
    let heldLockAttemptsAtWrite = 0;
    cloudflareUpsertTxtRecord.mockImplementation(async () => {
      heldLockAttemptsAtWrite = heldLockAttempts;
    });
    const exampleOrgZone = { ...EXAMPLE_COM_ZONE, hostedZoneId: "zone-2", zoneName: "example.org" };

    try {
      await expect(
        validateDomains({ dnsNames: ["example.com", "example.org"], dnsZones: [EXAMPLE_COM_ZONE, exampleOrgZone] })
      ).resolves.toEqual([
        "Couldn't validate example.com automatically: another certificate request is still validating it"
      ]);
      expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
      expect(heldLockAttempts).toBeGreaterThan(heldLockAttemptsAtWrite);
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(
        "Validating example.com, example.org with DigiCert using a persistent DNS TXT record"
      );
    } finally {
      dateNow.mockRestore();
      if (lockAvailable) keyStore.acquireLock.mockImplementation(lockAvailable);
    }
  });

  test("starts no further zones once the time for automatic validation has run out", async () => {
    let now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      now += 5_000;
      return now;
    });
    const lockAvailable = keyStore.acquireLock.getMockImplementation();
    keyStore.acquireLock.mockImplementation(async (keys: string[]) => {
      if (keys[0].includes("example.com")) throw new Error("lock is held");
      return lockAvailable!(keys);
    });
    const zones = ["example.com", "example.org", "example.net", "example.io"].map((zoneName, index) => ({
      ...EXAMPLE_COM_ZONE,
      hostedZoneId: `zone-${index}`,
      zoneName
    }));

    try {
      const failures = await validateDomains({ dnsNames: zones.map(({ zoneName }) => zoneName), dnsZones: zones });
      expect(failures.filter((failure) => failure.includes("example.io"))).toEqual([
        "Couldn't validate example.io automatically: the time for automatic validation ran out before it started"
      ]);
      expect(client.addDomain).not.toHaveBeenCalledWith(expect.objectContaining({ name: "example.io" }));
    } finally {
      dateNow.mockRestore();
      if (lockAvailable) keyStore.acquireLock.mockImplementation(lockAvailable);
    }
  });

  test("starts no further zones once the request is cancelled", async () => {
    const zones = ["example.com", "example.org", "example.net", "example.io"].map((zoneName, index) => ({
      ...EXAMPLE_COM_ZONE,
      hostedZoneId: `zone-${index}`,
      zoneName
    }));
    let isRequestCancelled = false;
    cloudflareUpsertTxtRecord.mockImplementation(async () => {
      isRequestCancelled = true;
    });

    await validateDomains({
      dnsNames: zones.map(({ zoneName }) => zoneName),
      dnsZones: zones,
      isCancelled: async () => isRequestCancelled
    });

    expect(client.addDomain).not.toHaveBeenCalledWith(expect.objectContaining({ name: "example.io" }));
    expect(cloudflareUpsertTxtRecord.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test("doesn't treat a parent validated over HTTP as covering its subdomains", async () => {
    digicertDomains = [
      {
        id: 5,
        name: "example.com",
        is_active: true,
        dcv_approval_method: "http-token",
        validations: [{ type: DigiCertDomainValidationType.Ov, status: DigiCertDomainValidationStatus.Active }]
      }
    ];
    await expect(validateDomains({ dnsNames: ["api.example.com"] })).resolves.toEqual([]);
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
  });

  test("writes the record for a wildcard even when its base domain was validated over HTTP", async () => {
    digicertDomains = [
      {
        id: 5,
        name: "example.com",
        is_active: true,
        dcv_approval_method: "http-token",
        validations: [{ type: DigiCertDomainValidationType.Ov, status: DigiCertDomainValidationStatus.Active }]
      }
    ];
    await expect(validateDomains({ dnsNames: ["*.example.com"] })).resolves.toEqual([]);
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledTimes(1);
  });

  test("never writes the same zone's record for two DigiCert organizations at once", async () => {
    let writesInFlight = 0;
    let mostWritesAtOnce = 0;
    route53UpsertTxtRecord.mockImplementation(async () => {
      writesInFlight += 1;
      mostWritesAtOnce = Math.max(mostWritesAtOnce, writesInFlight);
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      writesInFlight -= 1;
    });
    const route53Zone = { ...EXAMPLE_COM_ZONE, provider: AcmeDnsProvider.Route53 };

    await expect(
      Promise.all([
        validateDomains({ dnsNames: ["example.com"], dnsZones: [route53Zone], organizationId: 1 }),
        validateDomains({ dnsNames: ["example.com"], dnsZones: [route53Zone], organizationId: 2 })
      ])
    ).resolves.toEqual([[], []]);
    expect(route53UpsertTxtRecord).toHaveBeenCalledTimes(2);
    expect(mostWritesAtOnce).toBe(1);
  });

  test("falls back when the DNS provider never answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let markWriteStarted = () => {};
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    cloudflareUpsertTxtRecord.mockImplementation(() => {
      markWriteStarted();
      return new Promise(() => {});
    });

    try {
      const failures = validateDomains({ dnsNames: ["example.com"] });
      await writeStarted;
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      await expect(failures).resolves.toEqual([
        "Couldn't validate example.com automatically: the DNS provider or DigiCert didn't answer before the time for automatic validation ran out"
      ]);
      expect(client.validateDomainDcv).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("stops waiting for another request's lock at the validation deadline", async () => {
    let now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      now += 5_000;
      return now;
    });
    const lockAvailable = keyStore.acquireLock.getMockImplementation();
    keyStore.acquireLock.mockRejectedValue(new Error("lock is held"));

    try {
      await expect(validateDomains({ dnsNames: ["example.com"] })).resolves.toEqual([
        "Couldn't validate example.com automatically: another certificate request is still validating it"
      ]);
      expect(keyStore.acquireLock.mock.calls.length).toBeLessThan(40);
      expect(cloudflareUpsertTxtRecord).not.toHaveBeenCalled();
    } finally {
      dateNow.mockRestore();
      if (lockAvailable) keyStore.acquireLock.mockImplementation(lockAvailable);
    }
  });

  test("falls back with the domain and the DNS provider's error when the record can't be written", async () => {
    cloudflareUpsertTxtRecord.mockRejectedValue(new Error("Authentication error"));

    const failures = await validateDomains({ dnsNames: ["example.com"] });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("example.com");
    expect(failures[0]).toContain("Authentication error");
    expect(client.validateDomainDcv).not.toHaveBeenCalled();
    expect(heldLocks.size).toBe(0);
  });

  test("keeps validating other zones when DigiCert refuses one domain", async () => {
    const exampleOrgZone = { ...EXAMPLE_COM_ZONE, hostedZoneId: "zone-3", zoneName: "example.org" };
    client.addDomain.mockRejectedValueOnce(new Error("DigiCert refused the domain"));

    const failures = await validateDomains({
      dnsNames: ["example.com", "example.org"],
      dnsZones: [EXAMPLE_COM_ZONE, exampleOrgZone]
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("example.com");
    expect(cloudflareUpsertTxtRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fqdn: "_validation-persist.example.org" }),
      expect.anything()
    );
  });

  test("falls back after the last check when DigiCert still can't see the record", async () => {
    client.validateDomainDcv.mockResolvedValue(DigiCertDomainValidationStatus.Pending);

    const failures = await validateDomains({ dnsNames: ["example.com"] });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("example.com");
    expect(client.validateDomainDcv).toHaveBeenCalledTimes(6);
  });

  test("falls back without writing records when DigiCert's domain list can't be read", async () => {
    client.listDomains.mockRejectedValue(new Error("rate limited"));

    const failures = await validateDomains({ dnsNames: ["example.com"] });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("example.com");
    expect(cloudflareUpsertTxtRecord).not.toHaveBeenCalled();
  });

  test("stops checking once the request is cancelled", async () => {
    client.validateDomainDcv.mockResolvedValue(DigiCertDomainValidationStatus.Pending);
    const isCancelled = vi.fn(async () => client.validateDomainDcv.mock.calls.length > 0);

    await validateDomains({ dnsNames: ["example.com"], isCancelled });

    expect(client.validateDomainDcv).toHaveBeenCalledTimes(1);
  });
});
