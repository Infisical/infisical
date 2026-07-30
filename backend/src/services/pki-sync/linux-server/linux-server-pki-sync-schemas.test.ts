import { LinuxServerPkiSyncConfigSchema, LinuxServerPkiSyncOptionsSchema } from "./linux-server-pki-sync-schemas";

const parseName = (certificateNameSchema: string) =>
  LinuxServerPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

const parsePath = (destinationPath: string) => LinuxServerPkiSyncConfigSchema.safeParse({ destinationPath }).success;

describe("Linux Server certificateNameSchema validation", () => {
  test("accepts a fixed name with no placeholder (single-certificate sync)", () => {
    expect(parseName("server")).toBe(true);
    expect(parseName("my-cert_v1.0")).toBe(true);
  });

  test("accepts the supported placeholders", () => {
    expect(parseName("{{commonName}}")).toBe(true);
    expect(parseName("{{certificateId}}")).toBe(true);
    expect(parseName("cert-{{shortCertificateId}}")).toBe(true);
    expect(parseName("{{profileId}}-{{commonName}}")).toBe(true);
  });

  test("rejects path separators in the compiled name", () => {
    // The name is a single file segment; slashes/backslashes are not allowed. Traversal is
    // impossible from a single segment: a format suffix is always appended (".." -> "...pem").
    expect(parseName("sub/dir")).toBe(false);
    expect(parseName("a\\b")).toBe(false);
  });

  test("rejects characters outside the allowed set", () => {
    expect(parseName("cert*")).toBe(false);
    expect(parseName("cert name")).toBe(false);
    expect(parseName("{{environment}}")).toBe(false);
  });

  test("requires a schema (rejects empty)", () => {
    expect(parseName("")).toBe(false);
    expect(LinuxServerPkiSyncOptionsSchema.safeParse({}).success).toBe(false);
  });
});

describe("Linux Server destinationPath validation", () => {
  test("accepts absolute POSIX paths", () => {
    expect(parsePath("/etc/ssl/certs")).toBe(true);
    expect(parsePath("/home/ec2-user/certs")).toBe(true);
  });

  test("rejects relative paths", () => {
    expect(parsePath("etc/ssl/certs")).toBe(false);
    expect(parsePath("./certs")).toBe(false);
  });

  test("rejects paths containing traversal", () => {
    expect(parsePath("/etc/../etc/certs")).toBe(false);
    expect(parsePath("/certs/..")).toBe(false);
  });

  test("rejects an empty path", () => {
    expect(parsePath("")).toBe(false);
  });
});
