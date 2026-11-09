import { InstanceConfig, TInstanceConfigProps } from "./instance-config";
import { InstanceConfigChange } from "./instance-config-change";

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

describe("InstanceConfig.toView", () => {
  test("should contain no encrypted column", () => {
    // Setup
    const config = InstanceConfig.restore(
      row({ encryptedSlackClientId: Buffer.from("x"), encryptedEnvOverrides: Buffer.from("y") })
    );

    // Action
    const view = config.toView();

    // Assert
    expect(Object.keys(view).filter((key) => key.startsWith("encrypted"))).toEqual([]);
    expect(view.allowSignUp).toBe(true);
  });
});

describe("InstanceConfig.fromCached", () => {
  test("should read back a row a previous release cached, with its dates and ciphertext", () => {
    // Setup
    const cipherText = Buffer.from([1, 2, 3]);
    const cached = JSON.parse(JSON.stringify(row({ encryptedSlackClientId: cipherText }))) as TInstanceConfigProps;

    // Action
    const config = InstanceConfig.fromCached(cached);

    // Assert
    expect(config.updatedAt).toEqual(new Date("2026-01-02T00:00:00.000Z"));
    expect(config.encrypted("encryptedSlackClientId")).toEqual(cipherText);
  });
});

describe("InstanceConfigChange.create", () => {
  test("should refuse a change with no field set", () => {
    // Action
    const create = () => InstanceConfigChange.create({ allowSignUp: undefined });

    // Assert
    expect(create).toThrow("No recognized instance configuration fields were provided");
  });
});
