import { DatabaseErrorCode } from "@app/lib/error-codes";

import { findOrCreateNetworkInstallation } from "./pki-discovery-scan-fns";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

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
