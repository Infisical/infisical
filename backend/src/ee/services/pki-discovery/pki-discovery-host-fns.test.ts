import { TCertificateScanRpcFailure } from "@app/lib/gateway-v2/certificate-scan-rpc";

import { computeLocationFingerprint } from "./pki-discovery-fns";
import {
  buildHostInstallationName,
  CertificateScanResponseSchema,
  describeCertificateScanFailure,
  describeHostFileError,
  normalizeHostIdentifier,
  planHostFileImport,
  summarizeHostScanIssues,
  TCertificateScanFile
} from "./pki-discovery-host-fns";
import { LinuxServerTargetConfigSchema } from "./pki-discovery-schemas";
import {
  HostCertificateChainKind,
  HostCertificateFileStatus,
  HostFileImportAction,
  PkiInstallationLocationType,
  PkiKeystoreStatus
} from "./pki-discovery-types";
import { sanitizePkiInstallation } from "./pki-installation-service";

const baseFile = (overrides: Partial<TCertificateScanFile>): TCertificateScanFile => ({
  path: "/etc/ssl/a.pem",
  realPath: "/etc/ssl/a.pem",
  status: HostCertificateFileStatus.Ok,
  isKeystore: false,
  chains: [],
  ...overrides
});

const leafChain = { kind: HostCertificateChainKind.Leaf, certificates: ["AQID"] };
const caChain = { kind: HostCertificateChainKind.Ca, certificates: ["BAUG"] };
const plan = (file: TCertificateScanFile, importStandaloneCaCertificates = false) =>
  planHostFileImport(file, { importStandaloneCaCertificates });

describe("planHostFileImport", () => {
  test("imports leaf chains and only imports standalone CAs when asked", () => {
    expect(plan(baseFile({ chains: [leafChain, caChain] }))).toMatchObject({
      action: HostFileImportAction.Upsert,
      locationType: PkiInstallationLocationType.Filesystem,
      chainsToImport: [expect.anything()]
    });
    expect(plan(baseFile({ chains: [caChain] })).action).toBe(HostFileImportAction.Skip);
    expect(plan(baseFile({ chains: [caChain] }), true).action).toBe(HostFileImportAction.Upsert);
  });

  test("keystore states", () => {
    expect(plan(baseFile({ isKeystore: true, status: HostCertificateFileStatus.Locked }))).toMatchObject({
      action: HostFileImportAction.Upsert,
      keystoreStatus: PkiKeystoreStatus.Locked,
      chainsToImport: []
    });
    expect(plan(baseFile({ isKeystore: true, chains: [caChain] }))).toMatchObject({
      action: HostFileImportAction.Refresh,
      keystoreStatus: PkiKeystoreStatus.Readable
    });
    expect(plan(baseFile({ status: HostCertificateFileStatus.NoCertificates })).action).toBe(HostFileImportAction.Skip);
  });

  test.each([HostCertificateFileStatus.AccessDenied, HostCertificateFileStatus.TooLarge])(
    "skips %s files",
    (status) => {
      expect(plan(baseFile({ status }), true).action).toBe(HostFileImportAction.Skip);
    }
  );
});

describe("host identity", () => {
  test("the same path on two hosts gives two installations", () => {
    const fingerprint = (hostIdentifier: string) =>
      computeLocationFingerprint(
        PkiInstallationLocationType.Filesystem,
        { hostIdentifier, filePath: "/etc/ssl/a.pem" },
        "gw-1"
      );
    expect(fingerprint("10.0.1.12")).not.toBe(fingerprint("10.0.1.13"));
  });

  test("host identifiers keep non-default ports and bracket IPv6", () => {
    expect(normalizeHostIdentifier(" Web-01.Example.com ", 22)).toBe("web-01.example.com");
    expect(normalizeHostIdentifier("bastion.example.com", 2201)).toBe("bastion.example.com:2201");
    expect(normalizeHostIdentifier("FD00::5", 2222)).toBe("[fd00::5]:2222");
  });

  test("installations are named after the hostname, or the address without one", () => {
    expect(buildHostInstallationName("127.0.0.1:2222", "web-01", "/a.pem")).toBe("web-01:/a.pem");
    expect(buildHostInstallationName("127.0.0.1:2222", "", "/a.pem")).toBe("127.0.0.1:2222:/a.pem");
  });
});

describe("messages", () => {
  test("file errors and scan issues read as product messages", () => {
    expect(describeHostFileError(HostCertificateFileStatus.ReadFailed)).toBe("The file could not be read");
    const response = CertificateScanResponseSchema.parse({
      host: { hostname: "web-01" },
      files: [
        { path: "/a", realPath: "/a", status: "accessDenied", chains: null },
        { path: "/b", realPath: "/b", status: "accessDenied", chains: null },
        { path: "/c", realPath: "/c", status: "somethingNew", chains: [{ kind: "somethingNew", certificates: [] }] }
      ],
      deniedFolders: ["/etc/private"],
      truncatedReason: "somethingNew"
    });
    expect(summarizeHostScanIssues("web-01", response)).toEqual([
      "web-01: The SSH user can't read the file (/a and 1 more)",
      "web-01: The file could not be read (/c)",
      "web-01: The SSH user can't open 1 folder(s) (/etc/private)",
      "web-01: The scan stopped early, so some files were not checked"
    ]);
    expect(response.files[2].chains[0].kind).toBe(HostCertificateChainKind.Ca);
  });

  test("gateway failures never expose the raw gateway text", () => {
    const failure = (overrides: Partial<TCertificateScanRpcFailure>): TCertificateScanRpcFailure => ({
      ok: false,
      status: 502,
      kind: null,
      detail: "ssh: handshake failed",
      ...overrides
    });
    expect(describeCertificateScanFailure(failure({ kind: "auth" }), "gw")).toBe(
      "Could not sign in with the SSH connection's credentials"
    );
    expect(describeCertificateScanFailure(failure({}), "gw")).toBe("Gateway 'gw' could not scan the host");
  });
});

describe("target config validation", () => {
  const connectionId = "4b7d3b5e-2f7c-4a8e-9a55-0b3f3d6f1a10";
  const issues = (config: Record<string, unknown>) => {
    const parsed = LinuxServerTargetConfigSchema.safeParse(config);
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  };

  test("Linux Server jobs check their own fields", () => {
    expect(issues({ connectionIds: [connectionId], searchFolderPaths: ["/etc"] })).toEqual([]);
    expect(issues({ connectionIds: [connectionId], searchFolderPaths: ["/etc"], domains: ["example.com"] })).toEqual([
      ": Unrecognized key(s) in object: 'domains'"
    ]);
    expect(issues({ connectionIds: [connectionId, connectionId], searchFolderPaths: ["/etc"] })).toEqual([
      "connectionIds: Each SSH connection can be listed once"
    ]);
  });

  test.each(["etc/ssl", "/etc/../root", "/etc\nssl"])("rejects folder %s", (folder) => {
    expect(issues({ connectionIds: [connectionId], searchFolderPaths: [folder] })).not.toEqual([]);
  });
});

test("installation responses never include the encrypted keystore password", () => {
  expect(sanitizePkiInstallation({ id: "x", encryptedCredentials: Buffer.from("secret") })).toEqual({
    id: "x",
    hasKeystorePassword: true
  });
});
