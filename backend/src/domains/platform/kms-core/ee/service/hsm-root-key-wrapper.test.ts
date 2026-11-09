import { HsmRootKeyWrapper } from "./hsm-root-key-wrapper";

describe("HsmRootKeyWrapper.assertEntitled", () => {
  // A license refreshed after boot can add HSM; switching the root key to HSM must not need a restart.
  test("should follow the current license, not the one read at boot", () => {
    // Setup
    const license = { hsm: false };
    const wrapper = new HsmRootKeyWrapper();
    wrapper.attach({} as never, () => license.hsm);
    const check = () => wrapper.assertEntitled();

    // Action
    license.hsm = true;

    // Assert
    expect(check).not.toThrow();
  });

  test("should refuse while the license does not include HSM", () => {
    // Setup
    const wrapper = new HsmRootKeyWrapper();
    wrapper.attach({} as never, () => false);

    // Action
    const result = () => wrapper.assertEntitled();

    // Assert
    expect(result).toThrow("Your license does not include HSM integration");
  });
});
