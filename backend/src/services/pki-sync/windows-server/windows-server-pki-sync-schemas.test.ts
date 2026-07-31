import { WindowsServerPkiSyncConfigSchema, WindowsServerPkiSyncOptionsSchema } from "./windows-server-pki-sync-schemas";

const parseName = (certificateNameSchema: string) =>
  WindowsServerPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

const parsePath = (destinationPath: string) => WindowsServerPkiSyncConfigSchema.safeParse({ destinationPath }).success;

describe("Windows Server certificateNameSchema validation", () => {
  test("accepts a fixed name with no placeholder (single-certificate sync)", () => {
    expect(parseName("server")).toBe(true);
    expect(parseName("my-cert_v1.0")).toBe(true);
  });

  test("accepts the supported placeholders", () => {
    expect(parseName("{{commonName}}")).toBe(true);
    expect(parseName("{{certificateId}}")).toBe(true);
    expect(parseName("cert-{{shortCertificateId}}")).toBe(true);
  });

  test("rejects path separators and forbidden characters", () => {
    expect(parseName("sub/dir")).toBe(false);
    expect(parseName("a\\b")).toBe(false);
    expect(parseName("cert*")).toBe(false);
    expect(parseName("cert:name")).toBe(false);
  });

  test("requires a schema (rejects empty)", () => {
    expect(parseName("")).toBe(false);
    expect(WindowsServerPkiSyncOptionsSchema.safeParse({}).success).toBe(false);
  });
});

describe("Windows Server destinationPath validation", () => {
  test("accepts absolute drive-letter paths", () => {
    expect(parsePath("C:\\certs")).toBe(true);
    expect(parsePath("D:\\ProgramData\\ssl\\certs")).toBe(true);
  });

  test("rejects UNC paths", () => {
    // UNC destinations would make the target host authenticate to, and write key material at, an
    // arbitrary SMB server, so only local drive paths are allowed.
    expect(parsePath("\\\\server\\share")).toBe(false);
    expect(parsePath("\\\\host\\share\\certs")).toBe(false);
  });

  test("rejects relative and non-Windows paths", () => {
    expect(parsePath("certs")).toBe(false);
    expect(parsePath("/etc/ssl/certs")).toBe(false);
    expect(parsePath("certs\\sub")).toBe(false);
  });

  test("rejects paths containing traversal", () => {
    expect(parsePath("C:\\certs\\..\\other")).toBe(false);
    expect(parsePath("C:\\certs\\..")).toBe(false);
  });

  test("rejects an empty path", () => {
    expect(parsePath("")).toBe(false);
  });
});

describe("Windows Server postSyncCommand validation", () => {
  const parseCommand = (postSyncCommand: string) =>
    WindowsServerPkiSyncOptionsSchema.safeParse({ certificateNameSchema: "server", postSyncCommand });

  test("accepts a single-line and a multi-line PowerShell command", () => {
    expect(parseCommand('Restart-Service -Name "W3SVC"').success).toBe(true);
    expect(parseCommand("Import-PfxCertificate -FilePath {{certificatePath}}\niisreset").success).toBe(true);
  });

  test("treats an empty or whitespace-only command as no command", () => {
    expect(parseCommand("").data?.postSyncCommand).toBeUndefined();
    expect(parseCommand("   ").data?.postSyncCommand).toBeUndefined();
  });

  test("rejects a command beyond the length limit", () => {
    expect(parseCommand("a".repeat(2048)).success).toBe(true);
    expect(parseCommand("a".repeat(2049)).success).toBe(false);
  });

  test("is optional", () => {
    expect(WindowsServerPkiSyncOptionsSchema.safeParse({ certificateNameSchema: "server" }).success).toBe(true);
  });
});
