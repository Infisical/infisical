import { crypto } from "./crypto";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("crypto.initialize", () => {
  const fipsEnabled = process.env.FIPS_ENABLED;

  afterEach(() => {
    if (fipsEnabled === undefined) delete process.env.FIPS_ENABLED;
    else process.env.FIPS_ENABLED = fipsEnabled;
  });

  test("should not read the stored FIPS setting when FIPS is not enabled", async () => {
    // Setup
    delete process.env.FIPS_ENABLED;
    const readFipsSetting = vi.fn(async () => true);

    // Action
    const enabled = await crypto.initialize(readFipsSetting);

    // Assert
    expect(enabled).toBe(false);
    expect(readFipsSetting).not.toHaveBeenCalled();
  });
});
