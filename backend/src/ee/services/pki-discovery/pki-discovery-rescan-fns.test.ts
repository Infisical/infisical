import { THostScanDeps } from "./pki-discovery-host-scan-fns";
import { rescanInstallation } from "./pki-discovery-rescan-fns";
import { PkiInstallationLocationType } from "./pki-discovery-types";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe("rescanInstallation", () => {
  test("reads the installation on the primary, since its password was just written", async () => {
    const primary = { kind: "primary" };
    const findById = vi.fn().mockResolvedValue(undefined);
    const deps = {
      pkiCertificateInstallationDAL: { findById, primaryNode: vi.fn(() => primary) }
    } as unknown as THostScanDeps;

    await rescanInstallation("8d3b0b0e-6a1f-4f4e-9c55-2f1f7a0b6c10", deps);

    expect(findById).toHaveBeenCalledWith("8d3b0b0e-6a1f-4f4e-9c55-2f1f7a0b6c10", primary);
  });

  test("an unexpected failure is recorded as a product message, never the raw error", async () => {
    const installation = {
      id: "8d3b0b0e-6a1f-4f4e-9c55-2f1f7a0b6c10",
      projectId: "c2a1f0e9-8d7c-4b6a-9f5e-4d3c2b1a0f9e",
      locationType: PkiInstallationLocationType.Keystore,
      locationDetails: { connectionId: "5f0c8a52-1b9e-4c2d-8f4a-7e6d5c4b3a21", filePath: "/etc/ssl/app.p12" },
      metadata: {}
    };
    const updateById = vi.fn().mockResolvedValue(undefined);
    const deps = {
      pkiCertificateInstallationDAL: {
        findById: vi.fn().mockResolvedValue(installation),
        primaryNode: vi.fn(),
        updateById
      },
      projectDAL: { findById: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.4:5432")) }
    } as unknown as THostScanDeps;

    await rescanInstallation(installation.id, deps);

    expect(updateById).toHaveBeenCalledWith(installation.id, {
      metadata: expect.objectContaining({ lastError: "The scan failed unexpectedly. Try again later." }) as unknown
    });
  });
});
