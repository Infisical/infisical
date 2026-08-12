import {
  exportCertificateForSync,
  getExportedCertificateFileSuffixes,
  PemCertificateExtension,
  PkiSyncExportFormat,
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

  test.each([true, false])("PKCS#12 is always a single .pfx (includeKey=%s)", (includePrivateKey) => {
    expect(
      getExportedCertificateFileSuffixes({
        format: PkiSyncExportFormat.Pkcs12,
        includePrivateKey,
        hasCertificateChain: true,
        hasPrivateKey: true
      })
    ).toEqual([".pfx"]);
  });
});
