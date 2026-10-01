import forge from "node-forge";

import { crypto } from "@app/lib/crypto/cryptography";

import {
  buildStaleFileWarning,
  exportCertificateForSync,
  getExportedCertificateFileSuffixes,
  getUnusedKeystoreOptionMessage,
  isExportFormatBlockedByFips,
  PemCertificateExtension,
  PkiSyncExportFormat,
  planStaleCertificateFileCleanup,
  TExportedCertificateFile
} from "./pki-sync-export-fns";

const CERT = "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----";
const CHAIN = "-----BEGIN CERTIFICATE-----\nchain\n-----END CERTIFICATE-----";
const KEY = "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----";

const suffixes = (files: TExportedCertificateFile[]) => files.map((f) => f.suffix).sort();

describe("exportCertificateForSync (PEM)", () => {
  test("writes certificate, chain, and key when the key is included", async () => {
    const files = await exportCertificateForSync({
      format: PkiSyncExportFormat.Pem,
      certificate: CERT,
      certificateChain: CHAIN,
      privateKey: KEY,
      includePrivateKey: true,
      alias: "api.example.com"
    });

    expect(suffixes(files)).toEqual([".chain.pem", ".key", ".pem"]);
    const key = files.find((f) => f.suffix === ".key");
    expect(key?.isPrivateKey).toBe(true);
    expect(key?.content.toString()).toBe(KEY);
    expect(files.find((f) => f.suffix === ".pem")?.content.toString()).toBe(CERT);
  });

  test("omits the key file when includePrivateKey is false", async () => {
    const files = await exportCertificateForSync({
      format: PkiSyncExportFormat.Pem,
      certificate: CERT,
      certificateChain: CHAIN,
      privateKey: KEY,
      includePrivateKey: false,
      alias: "api.example.com"
    });

    expect(suffixes(files)).toEqual([".chain.pem", ".pem"]);
  });

  test("omits the chain file when no chain is provided", async () => {
    const files = await exportCertificateForSync({
      format: PkiSyncExportFormat.Pem,
      certificate: CERT,
      privateKey: KEY,
      includePrivateKey: true,
      alias: "api.example.com"
    });

    expect(suffixes(files)).toEqual([".key", ".pem"]);
  });
});

const everyPemShape = () => {
  const shapes = [];
  for (const pemCertificateExtension of [PemCertificateExtension.Pem, PemCertificateExtension.Crt]) {
    for (const combineCertificateChain of [true, false]) {
      for (const includePrivateKey of [true, false]) {
        for (const hasCertificateChain of [true, false]) {
          for (const hasPrivateKey of [true, false]) {
            shapes.push({
              format: PkiSyncExportFormat.Pem,
              pemCertificateExtension,
              combineCertificateChain,
              includePrivateKey,
              hasCertificateChain,
              hasPrivateKey
            });
          }
        }
      }
    }
  }
  return shapes;
};

describe("getExportedCertificateFileSuffixes matches the real export", () => {
  test.each(everyPemShape())(
    "PEM ext=$pemCertificateExtension combined=$combineCertificateChain includeKey=$includePrivateKey chain=$hasCertificateChain key=$hasPrivateKey",
    async (shape) => {
      const exported = await exportCertificateForSync({
        format: shape.format,
        certificate: CERT,
        certificateChain: shape.hasCertificateChain ? CHAIN : undefined,
        privateKey: shape.hasPrivateKey ? KEY : undefined,
        includePrivateKey: shape.includePrivateKey,
        password: "pw",
        alias: "api.example.com",
        pemCertificateExtension: shape.pemCertificateExtension,
        combineCertificateChain: shape.combineCertificateChain
      });

      expect(getExportedCertificateFileSuffixes(shape).sort()).toEqual(suffixes(exported));
    }
  );

  const realPair = (() => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(2026, 0, 1);
    cert.validity.notAfter = new Date(2027, 0, 1);
    const attrs = [{ name: "commonName", value: "api.example.com" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);

    return {
      certificate: forge.pki.certificateToPem(cert),
      privateKey: forge.pki.privateKeyInfoToPem(
        forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey))
      )
    };
  })();

  test.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false]
  ])("PKCS#12 includeKey=%s chain=%s", async (includePrivateKey, hasCertificateChain) => {
    const shape = {
      format: PkiSyncExportFormat.Pkcs12 as const,
      includePrivateKey,
      hasCertificateChain,
      hasPrivateKey: true
    };

    const exported = await exportCertificateForSync({
      format: shape.format,
      certificate: realPair.certificate,
      certificateChain: hasCertificateChain ? realPair.certificate : undefined,
      privateKey: realPair.privateKey,
      includePrivateKey,
      password: "pw",
      alias: "api.example.com"
    });

    expect(getExportedCertificateFileSuffixes(shape).sort()).toEqual(suffixes(exported));
  });

  test("PKCS#12 needs the private key, so a certificate without one cannot be exported at all", async () => {
    await expect(
      exportCertificateForSync({
        format: PkiSyncExportFormat.Pkcs12,
        certificate: realPair.certificate,
        includePrivateKey: true,
        password: "pw",
        alias: "api.example.com"
      })
    ).rejects.toThrow(/PKCS#12 export is not supported for this key type/);
  });

  const otherCa = (() => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "02";
    cert.validity.notBefore = new Date(2026, 0, 1);
    cert.validity.notAfter = new Date(2027, 0, 1);
    const attrs = [{ name: "commonName", value: "Example CA" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);
    return forge.pki.certificateToPem(cert);
  })();

  test.each([
    [true, true, false],
    [true, false, true],
    [true, false, false],
    [false, true, true]
  ])("JKS truststore=%s chain=%s root=%s", async (includeTruststore, hasCertificateChain, hasRoot) => {
    const shape = {
      format: PkiSyncExportFormat.Jks as const,
      includePrivateKey: true,
      hasCertificateChain,
      hasPrivateKey: true,
      includeTruststore,
      hasTruststoreCertificates: hasCertificateChain || hasRoot
    };

    const exported = await exportCertificateForSync({
      format: shape.format,
      certificate: realPair.certificate,
      certificateChain: hasCertificateChain ? otherCa : undefined,
      caCertificate: hasRoot ? otherCa : undefined,
      privateKey: realPair.privateKey,
      includePrivateKey: true,
      includeTruststore,
      password: "changeit",
      alias: "api.example.com"
    });

    expect(getExportedCertificateFileSuffixes(shape).sort()).toEqual(suffixes(exported));
    expect(exported.find((f) => f.suffix === ".jks")?.isPrivateKey).toBe(true);
    expect(exported.find((f) => f.suffix === ".truststore.jks")?.isPrivateKey).toBeFalsy();
  });
});

describe("getUnusedKeystoreOptionMessage", () => {
  test("rejects keystore-only options a format does not use", () => {
    expect(
      getUnusedKeystoreOptionMessage({ exportFormat: PkiSyncExportFormat.Pem, keystoreAlias: "tomcat" })
    ).toContain("keystoreAlias");
    expect(
      getUnusedKeystoreOptionMessage({ exportFormat: PkiSyncExportFormat.Pkcs12, includeTruststore: true })
    ).toContain("includeTruststore");
  });

  test("accepts options that match the format", () => {
    expect(
      getUnusedKeystoreOptionMessage({
        exportFormat: PkiSyncExportFormat.Jks,
        keystoreAlias: "tomcat",
        includeTruststore: true
      })
    ).toBeUndefined();
    expect(
      getUnusedKeystoreOptionMessage({ exportFormat: PkiSyncExportFormat.Pkcs12, keystoreAlias: "tomcat" })
    ).toBeUndefined();
    expect(
      getUnusedKeystoreOptionMessage({ exportFormat: PkiSyncExportFormat.Pem, includeTruststore: false })
    ).toBeUndefined();
  });
});

describe("isExportFormatBlockedByFips", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("blocks only JKS when FIPS mode is on", () => {
    vi.spyOn(crypto, "isFipsModeEnabled").mockReturnValue(true);
    expect(isExportFormatBlockedByFips(PkiSyncExportFormat.Jks)).toBe(true);
    expect(isExportFormatBlockedByFips(PkiSyncExportFormat.Pkcs12)).toBe(false);
    expect(isExportFormatBlockedByFips(PkiSyncExportFormat.Pem)).toBe(false);
  });

  test("allows JKS when FIPS mode is off", () => {
    vi.spyOn(crypto, "isFipsModeEnabled").mockReturnValue(false);
    expect(isExportFormatBlockedByFips(PkiSyncExportFormat.Jks)).toBe(false);
  });
});

describe("planStaleCertificateFileCleanup", () => {
  const host = "host-a";
  const base = {
    writtenPaths: ["/certs/app.jks"],
    writtenTruststorePaths: [],
    deliveredPaths: new Set(["/certs/app.jks"]),
    currentHost: host
  };
  const previousMetadata = {
    host,
    files: ["/certs/app.pem", "/certs/app.key", "/certs/app.truststore.jks"],
    truststoreFiles: ["/certs/app.truststore.jks"]
  };

  test("removes every stale file when certificate removal is on", () => {
    const plan = planStaleCertificateFileCleanup({ ...base, previousMetadata, canRemoveCertificates: true });
    expect(plan.filesToRemove).toEqual(previousMetadata.files);
    expect(plan.buildSyncMetadata([])).toEqual({ files: ["/certs/app.jks"], truststoreFiles: [], host });
  });

  test("only removes a recorded truststore when certificate removal is off, and keeps tracking the rest", () => {
    const plan = planStaleCertificateFileCleanup({ ...base, previousMetadata, canRemoveCertificates: false });
    expect(plan.filesToRemove).toEqual(["/certs/app.truststore.jks"]);
    expect(plan.buildSyncMetadata([]).files).toEqual(["/certs/app.jks", "/certs/app.pem", "/certs/app.key"]);
  });

  test("keeps tracking a file whose removal failed so the next sync retries it", () => {
    const plan = planStaleCertificateFileCleanup({ ...base, previousMetadata, canRemoveCertificates: false });
    expect(plan.buildSyncMetadata(["/certs/app.truststore.jks"])).toEqual({
      files: ["/certs/app.jks", "/certs/app.pem", "/certs/app.key", "/certs/app.truststore.jks"],
      truststoreFiles: ["/certs/app.truststore.jks"],
      host
    });
  });

  test("keeps a keystore whose certificate name ends in .truststore", () => {
    const plan = planStaleCertificateFileCleanup({
      ...base,
      previousMetadata: { host, files: ["/certs/api.truststore.jks"], truststoreFiles: [] },
      canRemoveCertificates: false
    });
    expect(plan.filesToRemove).toEqual([]);
    expect(plan.buildSyncMetadata([]).files).toContain("/certs/api.truststore.jks");
  });

  test("keeps a file another certificate wrote this run", () => {
    const plan = planStaleCertificateFileCleanup({
      ...base,
      deliveredPaths: new Set(["/certs/app.jks", "/certs/app.pem"]),
      previousMetadata,
      canRemoveCertificates: true
    });
    expect(plan.filesToRemove).toEqual(["/certs/app.key", "/certs/app.truststore.jks"]);
  });

  test("deletes nothing and keeps tracking files recorded before hosts were saved", () => {
    const plan = planStaleCertificateFileCleanup({
      ...base,
      previousMetadata: { files: ["/certs/app.pem", "/certs/app.key"] },
      canRemoveCertificates: true
    });
    expect(plan.filesToRemove).toEqual([]);
    expect(plan.buildSyncMetadata([])).toEqual({
      files: ["/certs/app.jks", "/certs/app.pem", "/certs/app.key"],
      truststoreFiles: [],
      host
    });
  });

  test("neither deletes nor keeps files recorded on a different host", () => {
    const plan = planStaleCertificateFileCleanup({
      ...base,
      previousMetadata: { ...previousMetadata, host: "host-b" },
      canRemoveCertificates: true
    });
    expect(plan.filesToRemove).toEqual([]);
    expect(plan.buildSyncMetadata([]).files).toEqual(["/certs/app.jks"]);
  });

  test("falls back to the external identifier when no files were recorded", () => {
    const plan = planStaleCertificateFileCleanup({
      ...base,
      previousMetadata: { host, files: [] },
      previousExternalIdentifier: "/certs/app.pfx",
      canRemoveCertificates: true
    });
    expect(plan.filesToRemove).toEqual(["/certs/app.pfx"]);
  });

  test("compares paths without regard to case when asked", () => {
    const plan = planStaleCertificateFileCleanup({
      writtenPaths: ["C:\\certs\\App.jks"],
      writtenTruststorePaths: [],
      deliveredPaths: new Set(["C:\\certs\\App.jks"]),
      currentHost: "HOST-A",
      previousMetadata: { host, files: ["C:\\certs\\app.jks", "C:\\certs\\app.pem"] },
      canRemoveCertificates: true,
      caseInsensitive: true
    });
    expect(plan.filesToRemove).toEqual(["C:\\certs\\app.pem"]);
  });
});

describe("buildStaleFileWarning", () => {
  test("returns nothing when every removal succeeded", () => {
    expect(buildStaleFileWarning([])).toBeUndefined();
  });

  test("names the files that could not be removed", () => {
    const warning = buildStaleFileWarning([{ path: "/certs/app.truststore.jks", error: "Permission denied" }]);
    expect(warning).toContain("/certs/app.truststore.jks");
    expect(warning).toContain("Permission denied");
  });
});
