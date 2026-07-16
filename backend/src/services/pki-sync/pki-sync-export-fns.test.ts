import { exportCertificateForSync, PkiSyncExportFormat, TExportedCertificateFile } from "./pki-sync-export-fns";

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
