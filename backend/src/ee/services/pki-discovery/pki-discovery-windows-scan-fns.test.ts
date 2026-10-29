import { computeLocationFingerprint } from "./pki-discovery-fns";
import { normalizeHostIdentifier } from "./pki-discovery-host-fns";
import { selectsCaStoresWithoutImport, WindowsServerTargetConfigSchema } from "./pki-discovery-schemas";
import {
  HostCertificateChainKind,
  HostCertificateFileStatus,
  HostScanTruncationReason,
  PkiInstallationLocationType,
  WindowsCertificateStore
} from "./pki-discovery-types";
import {
  expandedChainBytes,
  resolveStoreChains,
  storeCertificatePath,
  summarizeWindowsScanIssues,
  WindowsCertificateScanResponseSchema
} from "./pki-discovery-windows-scan-fns";

describe("WindowsServerTargetConfigSchema", () => {
  const connectionId = "4b6f2c1e-8a5d-4c3b-9e7f-1a2b3c4d5e6f";

  test("defaults to the Personal and Web Hosting stores", () => {
    const parsed = WindowsServerTargetConfigSchema.parse({ connectionIds: [connectionId] });
    expect(parsed.certificateStores).toEqual([WindowsCertificateStore.Personal, WindowsCertificateStore.WebHosting]);
    expect(parsed.importStandaloneCaCertificates).toBe(false);
  });

  test("rejects unknown stores, duplicates and Linux fields", () => {
    expect(
      WindowsServerTargetConfigSchema.safeParse({ connectionIds: [connectionId], certificateStores: ["TrustedPeople"] })
        .success
    ).toBe(false);
    expect(
      WindowsServerTargetConfigSchema.safeParse({
        connectionIds: [connectionId],
        certificateStores: [WindowsCertificateStore.Personal, WindowsCertificateStore.Personal]
      }).success
    ).toBe(false);
    expect(
      WindowsServerTargetConfigSchema.safeParse({ connectionIds: [connectionId], searchPaths: ["/etc/ssl"] }).success
    ).toBe(false);
  });
});

describe("selectsCaStoresWithoutImport", () => {
  test("flags any CA store selected without CA import", () => {
    const personal = WindowsCertificateStore.Personal;
    const root = WindowsCertificateStore.TrustedRootCertificationAuthorities;
    expect(selectsCaStoresWithoutImport({ certificateStores: [root], importStandaloneCaCertificates: false })).toBe(
      true
    );
    expect(
      selectsCaStoresWithoutImport({ certificateStores: [personal, root], importStandaloneCaCertificates: false })
    ).toBe(true);
    expect(
      selectsCaStoresWithoutImport({ certificateStores: [personal, root], importStandaloneCaCertificates: true })
    ).toBe(false);
    expect(selectsCaStoresWithoutImport({ certificateStores: [personal], importStandaloneCaCertificates: false })).toBe(
      false
    );
  });
});

describe("WindowsCertificateScanResponseSchema", () => {
  const withChain = (indexes: number[]) => ({
    host: { hostname: "web-01" },
    pool: ["MA=="],
    certificates: [
      {
        store: WindowsCertificateStore.Personal,
        thumbprint: "AA",
        hasPrivateKey: true,
        status: HostCertificateFileStatus.Ok,
        chains: [{ kind: HostCertificateChainKind.Leaf, indexes }]
      }
    ]
  });

  test("rejects a chain that repeats a certificate or runs past the gateway's chain limit", () => {
    expect(WindowsCertificateScanResponseSchema.safeParse(withChain([0, 0])).success).toBe(false);
    expect(
      WindowsCertificateScanResponseSchema.safeParse(withChain(Array.from({ length: 11 }, (_, i) => i))).success
    ).toBe(false);
    expect(WindowsCertificateScanResponseSchema.safeParse(withChain([0])).success).toBe(true);
  });

  test("accepts a gateway response with null lists", () => {
    const parsed = WindowsCertificateScanResponseSchema.parse({
      host: { hostname: "web-01" },
      certificates: null,
      deniedStores: null
    });
    expect(parsed.certificates ?? []).toHaveLength(0);
  });

  test("keeps the rest of the scan when a newer gateway sends an unknown status or chain kind", () => {
    const parsed = WindowsCertificateScanResponseSchema.parse({
      host: { hostname: "web-01" },
      pool: ["MA=="],
      certificates: [
        {
          store: WindowsCertificateStore.Personal,
          thumbprint: "AA",
          hasPrivateKey: false,
          status: "someNewStatus",
          chains: [{ kind: "someNewKind", indexes: [0] }]
        }
      ]
    });
    expect(parsed.certificates?.[0].status).toBe(HostCertificateFileStatus.ReadFailed);
    expect(parsed.certificates?.[0].chains?.[0].kind).toBe(HostCertificateChainKind.Ca);
  });
});

describe("resolveStoreChains", () => {
  const pool = [Buffer.from("leaf"), Buffer.from("issuer")];
  const cert = (chains: { kind: HostCertificateChainKind; indexes: number[] }[]) => ({
    store: WindowsCertificateStore.Personal,
    thumbprint: "AA",
    hasPrivateKey: true,
    status: HostCertificateFileStatus.Ok,
    chains
  });

  test("maps pool indexes to certificates, leaf first", () => {
    expect(resolveStoreChains(cert([{ kind: HostCertificateChainKind.Leaf, indexes: [0, 1] }]), pool, false)).toEqual([
      [pool[0], pool[1]]
    ]);
  });

  test("skips CA chains unless CA certificates are included, and drops out-of-range indexes", () => {
    expect(resolveStoreChains(cert([{ kind: HostCertificateChainKind.Ca, indexes: [1] }]), pool, false)).toEqual([]);
    expect(resolveStoreChains(cert([{ kind: HostCertificateChainKind.Ca, indexes: [1] }]), pool, true)).toHaveLength(1);
    expect(resolveStoreChains(cert([{ kind: HostCertificateChainKind.Leaf, indexes: [0, 7] }]), pool, true)).toEqual(
      []
    );
  });
});

describe("Windows store installation identity", () => {
  test("omits the default WinRM port from the host identifier", () => {
    expect(normalizeHostIdentifier("WEB-01.corp.local", 5985, 5985)).toBe("web-01.corp.local");
    expect(normalizeHostIdentifier("web-01.corp.local", 5986, 5985)).toBe("web-01.corp.local:5986");
    expect(normalizeHostIdentifier("web-01.corp.local", 5986, 5986)).toBe("web-01.corp.local");
  });

  test("differs per store and per thumbprint", () => {
    const fingerprint = (store: string, thumbprint: string) =>
      computeLocationFingerprint(
        PkiInstallationLocationType.OsStore,
        { hostIdentifier: "web-01", filePath: storeCertificatePath(store, thumbprint) },
        "gw"
      );
    expect(storeCertificatePath("My", "AB12")).toBe("Cert:\\LocalMachine\\My\\AB12");
    expect(fingerprint("My", "AB12")).not.toBe(fingerprint("WebHosting", "AB12"));
    expect(fingerprint("My", "AB12")).not.toBe(fingerprint("My", "CD34"));
  });
});

describe("summarizeWindowsScanIssues", () => {
  test("names denied stores, unreadable server certificates and truncation", () => {
    const issues = summarizeWindowsScanIssues("web-01", {
      host: { hostname: "web-01" },
      deniedStores: [WindowsCertificateStore.WebHosting],
      certificates: [
        {
          store: WindowsCertificateStore.Personal,
          thumbprint: "AA",
          hasPrivateKey: true,
          status: HostCertificateFileStatus.ParseError,
          chains: []
        },
        {
          store: WindowsCertificateStore.Personal,
          thumbprint: "BB",
          hasPrivateKey: false,
          status: HostCertificateFileStatus.Ok,
          chains: [{ kind: HostCertificateChainKind.Leaf, indexes: [0] }]
        },
        {
          store: WindowsCertificateStore.IntermediateCertificationAuthorities,
          thumbprint: "CC",
          hasPrivateKey: false,
          status: HostCertificateFileStatus.ParseError,
          chains: []
        }
      ],
      truncatedReason: HostScanTruncationReason.MaxFiles
    });
    expect(issues).toEqual([
      "web-01: The connection's account can't open these certificate stores: Web Hosting",
      "web-01: These certificates could not be read: Personal (AA)",
      "web-01: The scan stopped after 5,000 certificates"
    ]);
  });

  test("reports unreadable CA store certificates only when CA certificates are imported", () => {
    const response = {
      host: { hostname: "web-01" },
      certificates: [
        {
          store: WindowsCertificateStore.IntermediateCertificationAuthorities,
          thumbprint: "CC",
          hasPrivateKey: false,
          status: HostCertificateFileStatus.ParseError,
          chains: []
        }
      ]
    };
    expect(summarizeWindowsScanIssues("web-01", response)).toEqual([]);
    expect(summarizeWindowsScanIssues("web-01", response, true)).toEqual([
      "web-01: These certificates could not be read: Intermediate Certification Authorities (CC)"
    ]);
  });

  test("tells the user to select fewer stores when the response was too large", () => {
    expect(
      summarizeWindowsScanIssues("web-01", {
        host: { hostname: "web-01" },
        certificates: [],
        truncatedReason: HostScanTruncationReason.ResponseSize
      })
    ).toEqual(["web-01: The scan found more certificates than one scan can return. Select fewer certificate stores."]);
  });

  test("warns when an issuer store couldn't be opened and when the scan ran out of time", () => {
    expect(
      summarizeWindowsScanIssues("web-01", {
        host: { hostname: "web-01" },
        certificates: [],
        unreadableIssuerStores: [WindowsCertificateStore.TrustedRootCertificationAuthorities],
        truncatedReason: HostScanTruncationReason.TimeLimit
      })
    ).toEqual([
      "web-01: The connection's account can't open Trusted Root Certification Authorities, so some certificate chains may be incomplete",
      "web-01: The scan ran out of time, so some certificates were not checked. Select fewer certificate stores."
    ]);
  });

  test("warns when an issuer store has more certificates than the scan reads", () => {
    expect(
      summarizeWindowsScanIssues("web-01", {
        host: { hostname: "web-01" },
        certificates: [],
        truncatedIssuerStores: [WindowsCertificateStore.IntermediateCertificationAuthorities]
      })
    ).toEqual([
      "web-01: Intermediate Certification Authorities holds more certificates than the scan reads for chains, so some certificate chains may be incomplete"
    ]);
  });

  test("reports nothing for a clean scan", () => {
    expect(summarizeWindowsScanIssues("web-01", { host: { hostname: "web-01" }, certificates: [] })).toEqual([]);
  });
});

describe("expandedChainBytes", () => {
  test("counts every pooled certificate a chain references", () => {
    const pool = [Buffer.alloc(100), Buffer.alloc(40)];
    const cert = {
      store: WindowsCertificateStore.Personal,
      thumbprint: "AA",
      hasPrivateKey: false,
      status: HostCertificateFileStatus.Ok,
      chains: [{ kind: HostCertificateChainKind.Leaf, indexes: [0, 1] }]
    };
    expect(expandedChainBytes([cert, { ...cert, thumbprint: "BB" }], pool)).toBe(280);
  });
});
