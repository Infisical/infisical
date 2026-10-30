import { countCertificatesHeldAfterUpdate } from "./pki-sync-filter-reconcile-fns";

const buildDeps = (matchCount: number, linkRows: number) => ({
  certificateDAL: { countCertificatesMatchingSyncFilters: vi.fn().mockResolvedValue(matchCount) },
  certificateSyncDAL: {
    findByPkiSyncId: vi.fn().mockResolvedValue(Array.from({ length: linkRows }, (_, i) => ({ id: `row-${i}` })))
  }
});

const sync = { id: "sync-1", projectId: "project-1", applicationId: "app-1" };

describe("countCertificatesHeldAfterUpdate", () => {
  test("counts what the filters match, not the link rows left behind", async () => {
    const deps = buildDeps(1, 3);

    await expect(
      countCertificatesHeldAfterUpdate(sync, { certificateOrderIds: ["order-1"] }, deps as never)
    ).resolves.toBe(1);

    expect(deps.certificateSyncDAL.findByPkiSyncId).not.toHaveBeenCalled();
    expect(deps.certificateDAL.countCertificatesMatchingSyncFilters).toHaveBeenCalledWith(
      { certificateOrderIds: ["order-1"] },
      { projectId: "project-1", applicationId: "app-1" }
    );
  });

  test("counts the link rows when the sync has no filters", async () => {
    const deps = buildDeps(1, 3);

    await expect(countCertificatesHeldAfterUpdate(sync, null, deps as never)).resolves.toBe(3);
    expect(deps.certificateDAL.countCertificatesMatchingSyncFilters).not.toHaveBeenCalled();
  });

  test("counts the link rows for a sync with no application, such as a subscriber sync", async () => {
    const deps = buildDeps(1, 2);

    await expect(
      countCertificatesHeldAfterUpdate(
        { ...sync, applicationId: null },
        { certificateOrderIds: ["order-1"] },
        deps as never
      )
    ).resolves.toBe(2);
    expect(deps.certificateDAL.countCertificatesMatchingSyncFilters).not.toHaveBeenCalled();
  });

  test("reports the larger count when the filters match more than is linked", async () => {
    const deps = buildDeps(5, 1);

    await expect(countCertificatesHeldAfterUpdate(sync, { profileIds: ["profile-1"] }, deps as never)).resolves.toBe(5);
  });
});
