import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

import { findOrCreateNetworkInstallation, processDiscoveredCertificate } from "./pki-discovery-scan-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

type TDeps = Parameters<typeof findOrCreateNetworkInstallation>[0];

const makeTx = (savepoint: object) =>
  ({ transaction: (cb: (sp: unknown) => unknown) => cb(savepoint) }) as unknown as Parameters<
    typeof findOrCreateNetworkInstallation
  >[1];

const data = {
  projectId: "c2a1f0e9-8d7c-4b6a-9f5e-4d3c2b1a0f9e",
  locationDetails: { ipAddress: "10.0.0.1", port: 443, protocol: "tls" },
  locationFingerprint: "fp-1",
  name: "10.0.0.1",
  scanTime: new Date("2026-10-21T00:00:00Z")
} as Parameters<typeof findOrCreateNetworkInstallation>[2];

describe("findOrCreateNetworkInstallation", () => {
  test("creates a new installation through a savepoint", async () => {
    const savepoint = {};
    const create = vi.fn().mockResolvedValue({ id: "installation-1" });
    const deps = {
      pkiCertificateInstallationDAL: {
        findByFingerprint: vi.fn().mockResolvedValue(undefined),
        create,
        updateById: vi.fn()
      }
    } as unknown as TDeps;

    const result = await findOrCreateNetworkInstallation(deps, makeTx(savepoint), data);

    expect(result).toEqual({ id: "installation-1" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ locationFingerprint: "fp-1" }), savepoint);
  });

  test("recovers from a concurrent insert by re-reading and refreshing lastSeenAt", async () => {
    const tx = makeTx({});
    const findByFingerprint = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: "installation-2" });
    const create = vi.fn().mockRejectedValue({ code: DatabaseErrorCode.UniqueViolation });
    const updateById = vi.fn().mockResolvedValue(undefined);
    const deps = {
      pkiCertificateInstallationDAL: { findByFingerprint, create, updateById }
    } as unknown as TDeps;

    const result = await findOrCreateNetworkInstallation(deps, tx, data);

    expect(result).toEqual({ id: "installation-2" });
    expect(findByFingerprint).toHaveBeenCalledTimes(2);
    expect(updateById).toHaveBeenCalledWith("installation-2", { lastSeenAt: data.scanTime }, tx);
  });
});

describe("processDiscoveredCertificate", () => {
  const certResult = {
    pemChain: [],
    fingerprint: "ab".repeat(32),
    fingerprintSha1: "cd".repeat(20),
    commonName: "web.example.com",
    notBefore: new Date("2026-01-01T00:00:00.000Z"),
    notAfter: new Date("2026-04-01T00:00:00.000Z"),
    serialNumber: "0a1b2c"
  } as Parameters<typeof processDiscoveredCertificate>[0];

  it("links the certificate a concurrent scan inserted when the insert hits the unique index", async () => {
    const primary = { node: "primary" };
    const findOneLiveFirst = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: "cert-2" });
    const certificateDAL = {
      findOneLiveFirst,
      primaryNode: vi.fn().mockReturnValue(primary),
      transaction: vi
        .fn()
        .mockRejectedValue(new DatabaseError({ name: "Create", error: { code: DatabaseErrorCode.UniqueViolation } }))
    };

    const result = await processDiscoveredCertificate(certResult, "project-1", {
      certificateDAL,
      certificateBodyDAL: {},
      kmsEncryptor: vi.fn()
    } as unknown as Parameters<typeof processDiscoveredCertificate>[2]);

    expect(result).toBe("cert-2");
    expect(findOneLiveFirst).toHaveBeenNthCalledWith(
      2,
      { projectId: "project-1", fingerprintSha256: certResult.fingerprint },
      primary
    );
  });
});
