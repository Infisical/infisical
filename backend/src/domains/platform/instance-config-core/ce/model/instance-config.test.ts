import { InstanceConfig, TEncryptedColumn, TInstanceConfigProps } from "./instance-config";

const row = (overrides: Partial<TInstanceConfigProps> = {}): TInstanceConfigProps => ({
  id: "00000000-0000-0000-0000-000000000000",
  instanceId: "11111111-1111-1111-1111-111111111111",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  allowSignUp: true,
  fipsEnabled: false,
  onboardingCompleted: false,
  defaultAuthOrgSlug: null,
  ...overrides
});

describe("InstanceConfig.toSettings", () => {
  test("should return the allowlisted fields and no ciphertext", () => {
    // Setup
    const config = InstanceConfig.restore(
      row({ encryptedSlackClientId: Buffer.from("x"), encryptedEnvOverrides: Buffer.from("y") })
    );

    // Action
    const settings = config.toSettings();

    // Assert
    expect(
      Object.keys(settings).every((key) => (InstanceConfig.SETTING_FIELDS as readonly string[]).includes(key))
    ).toBe(true);
    expect(settings).not.toHaveProperty("encryptedSlackClientId");
    expect(settings.allowSignUp).toBe(true);
  });

  test("should place every super_admin column in the settings or the encrypted columns", () => {
    // Assert: a new column fails this until it is listed in SETTING_FIELDS or TEncryptedColumn
    expectTypeOf<
      Exclude<keyof TInstanceConfigProps, (typeof InstanceConfig.SETTING_FIELDS)[number] | TEncryptedColumn>
    >().toEqualTypeOf<never>();
  });
});
