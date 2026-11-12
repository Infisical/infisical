import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../testing/build-license";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("LicenseService.getSeatUsage", () => {
  test("should count the root org's tree on cloud, in one count", async () => {
    // Setup
    const counted: (string | null)[] = [];
    const { licenseService } = await buildLicense({
      organizations: {
        countBillableOrgActors: async (orgId) => {
          counted.push(orgId);
          return { users: 3, identities: 4 };
        }
      }
    });

    // Action
    const usage = await licenseService.getSeatUsage(SUB_ORG_ID);

    // Assert
    expect([usage.membersUsed, usage.identitiesUsed]).toEqual([3, 7]);
    expect(counted).toEqual([ROOT.id]);
  });

  test("should count every org on the instance for the instance's seat usage, even on cloud", async () => {
    // Setup
    const { licenseService } = await buildLicense({
      organizations: {
        countBillableOrgActors: async (orgId) => ({ users: 0, identities: orgId === null ? 9 : 2 })
      }
    });

    // Action
    const usage = await licenseService.getInstanceSeatUsage();

    // Assert
    expect(usage.identitiesUsed).toBe(9);
  });

  test("should refuse an org that does not exist on cloud", async () => {
    // Setup
    const { licenseService } = await buildLicense();

    // Action
    const result = licenseService.getSeatUsage(OTHER_ROOT.id.replace("3", "5"));

    // Assert
    await expect(result).rejects.toThrow("not found");
  });
});
