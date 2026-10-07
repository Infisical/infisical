import * as x509 from "@peculiar/x509";
import { webcrypto } from "crypto";

import { NotFoundError } from "@app/lib/errors";

import { computeCertFingerprint, parseCertificateDer } from "./pki-discovery-fns";
import { scanHost, THostScanDeps, toHostScanErrorMessage, writeHostFile } from "./pki-discovery-host-scan-fns";
import { HostCertificateChainKind, HostCertificateFileStatus } from "./pki-discovery-types";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@app/lib/delay", () => ({ delay: vi.fn().mockResolvedValue(undefined) }));

x509.cryptoProvider.set(webcrypto as Crypto);

const host = {
  connectionId: "5f0c8a52-1b9e-4c2d-8f4a-7e6d5c4b3a21",
  hostIdentifier: "127.0.0.1:2222",
  hostAddress: "127.0.0.1",
  targetHost: "127.0.0.1",
  targetPort: 2222,
  gatewayId: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
  gatewayName: "gw-east",
  fingerprintGatewayKey: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
  credentials: {} as Parameters<typeof scanHost>[0]["credentials"]
};

const request = {
  searchFolderPaths: ["/etc/ssl"],
  skipFolderPaths: [],
  maxFolderDepth: 8,
  maxFileSizeBytes: 1024,
  filePaths: [],
  keystorePasswords: []
};

const scanDeps = (admitted: boolean) => {
  const keyStore = {
    incrementByAndRefreshExpiryIfUnderLimit: vi.fn().mockResolvedValue(admitted ? 1 : -1),
    decrementByOrDelete: vi.fn().mockResolvedValue(0)
  };
  const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn().mockResolvedValue(null) };
  return { keyStore, gatewayV2Service, deps: { keyStore, gatewayV2Service } as unknown as THostScanDeps };
};

describe("scanHost", () => {
  test("gives up on a busy connection without reaching the gateway", async () => {
    const { keyStore, gatewayV2Service, deps } = scanDeps(false);
    await expect(scanHost(host, request, deps)).rejects.toThrow("The SSH connection is busy");
    expect(gatewayV2Service.getPlatformConnectionDetailsByGatewayId).not.toHaveBeenCalled();
    expect(keyStore.decrementByOrDelete).not.toHaveBeenCalled();
  });

  test("releases the connection slot when the scan fails", async () => {
    const { keyStore, deps } = scanDeps(true);
    await expect(scanHost(host, request, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(keyStore.decrementByOrDelete).toHaveBeenCalledTimes(1);
  });
});

test("unexpected errors are hidden behind a product message", () => {
  expect(toHostScanErrorMessage(new NotFoundError({ message: "Gateway not found" }), "ctx")).toBe("Gateway not found");
  expect(toHostScanErrorMessage(new Error('relation "x" does not exist'), "ctx")).toBe(
    "The scan failed unexpectedly. Try again later."
  );
});

test("writeHostFile names a new installation after the hostname and links its certificate", async () => {
  const keys = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;
  const der = Buffer.from(
    (
      await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: "0a1b2c",
        name: "CN=a.example.com",
        notBefore: new Date("2026-01-01T00:00:00Z"),
        notAfter: new Date("2027-01-01T00:00:00Z"),
        keys,
        signingAlgorithm: { name: "ECDSA", hash: "SHA-256" }
      })
    ).rawData
  );
  const tx = {};
  const create = vi.fn().mockResolvedValue({ id: "installation-1" });
  const upsertCertLink = vi.fn().mockResolvedValue(undefined);
  const deps = {
    pkiDiscoveryConfigDAL: { transaction: (callback: (trx: unknown) => unknown) => callback(tx) },
    pkiCertificateInstallationDAL: { findByFingerprint: vi.fn().mockResolvedValue(undefined), create },
    pkiCertificateInstallationCertDAL: { upsertCertLink }
  } as unknown as THostScanDeps;
  const ctx = {
    projectId: "c2a1f0e9-8d7c-4b6a-9f5e-4d3c2b1a0f9e",
    scanTime: new Date("2026-10-07T00:00:00Z"),
    importStandaloneCaCertificates: false,
    kmsEncryptor: vi.fn(),
    certificateIdsByFingerprint: new Map([[computeCertFingerprint(der), "cert-1"]])
  } as unknown as Parameters<typeof writeHostFile>[2];

  await writeHostFile(
    { ...host, hostname: "web-01" },
    {
      path: "/etc/ssl/a.pem",
      realPath: "/etc/ssl/a.pem",
      status: HostCertificateFileStatus.Ok,
      isKeystore: false,
      chains: [{ kind: HostCertificateChainKind.Leaf, certificates: [der.toString("base64")] }]
    },
    ctx,
    deps
  );

  expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "web-01:/etc/ssl/a.pem" }), tx);
  expect(upsertCertLink).toHaveBeenCalledWith("installation-1", "cert-1", { lastSeenAt: ctx.scanTime }, tx);
});

test("parseCertificateDer reads subject and issuer fields without escaping", async () => {
  const keys = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "0d0e0f",
    name: [{ CN: ["ca.example.com"] }, { O: ["Example, Inc."] }, { OU: ["one"] }, { OU: ["two"] }],
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2027-01-01T00:00:00Z"),
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [
      new x509.BasicConstraintsExtension(true, 1, true),
      new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "ca.example.com" }])
    ]
  });

  expect(parseCertificateDer(Buffer.from(cert.rawData))).toMatchObject({
    commonName: "ca.example.com",
    subjectOrganization: "Example, Inc.",
    subjectOrganizationalUnit: "one, two",
    issuerCommonName: "ca.example.com",
    issuerOrganization: "Example, Inc.",
    altNames: "ca.example.com",
    isCA: true,
    pathLength: 1
  });
  expect(parseCertificateDer(Buffer.from("not a certificate"))).toBeNull();
});
