import { InstanceEncryptionKey } from "./instance-encryption-key";
import { RootKey } from "./root-key";

const UTF8_KEY = "4bnfe4e407b8921c104518903515b218";
const BASE64_KEY = Buffer.alloc(32, 7).toString("base64");

describe("InstanceEncryptionKey.fromEnv", () => {
  test("should resolve ENCRYPTION_KEY as UTF-8 and ROOT_ENCRYPTION_KEY as base64 to the same label for the same bytes", () => {
    // Setup
    const utf8 = { ENCRYPTION_KEY: UTF8_KEY };
    const base64 = { ROOT_ENCRYPTION_KEY: Buffer.from(UTF8_KEY, "utf8").toString("base64") };

    // Action
    const labels = [InstanceEncryptionKey.fromEnv(utf8).label, InstanceEncryptionKey.fromEnv(base64).label];

    // Assert
    expect(labels[0]).toBe(labels[1]);
    expect(labels[0]).toHaveLength(32);
  });

  test("should refuse an environment with no key", () => {
    // Setup
    const env = {};

    // Action
    const result = () => InstanceEncryptionKey.fromEnv(env);

    // Assert
    expect(result).toThrow("Instance encryption key not found. Did you set the ENCRYPTION_KEY environment variable?");
  });

  test("should refuse a key that does not resolve to 32 bytes, with the command that generates one", () => {
    // Setup
    const utf8 = { ENCRYPTION_KEY: "short" };
    const base64 = { ROOT_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") };

    // Action
    const results = [() => InstanceEncryptionKey.fromEnv(utf8), () => InstanceEncryptionKey.fromEnv(base64)];

    // Assert
    expect(results[0]).toThrow("resolves to 5 bytes, but 32 are required. Generate one with 'openssl rand -hex 16'.");
    expect(results[1]).toThrow(
      "resolves to 16 bytes, but 32 are required. Generate one with 'openssl rand -base64 32'."
    );
  });
});

describe("InstanceEncryptionKey.fromRotationValue", () => {
  test("should resolve a value the way a booting instance resolves the same environment", () => {
    // Setup
    const hex = "0123456789abcdef0123456789abcdef";

    // Action
    const software = InstanceEncryptionKey.fromRotationValue(hex, false);
    const fips = InstanceEncryptionKey.fromRotationValue(BASE64_KEY, true);

    // Assert
    expect(software.label).toBe(InstanceEncryptionKey.fromEnv({ ENCRYPTION_KEY: hex }).label);
    expect(fips.label).toBe(InstanceEncryptionKey.fromEnv({ ROOT_ENCRYPTION_KEY: BASE64_KEY }).label);
  });
});

describe("InstanceEncryptionKey.assertConfigured", () => {
  test("should accept a configured key outside FIPS, whatever its format", () => {
    // Setup
    const env = { ENCRYPTION_KEY: "not base64!" };

    // Action
    const result = () => InstanceEncryptionKey.assertConfigured(env, false);

    // Assert
    expect(result).not.toThrow();
  });

  test("should refuse a missing key", () => {
    // Setup
    const env = {};

    // Action
    const result = () => InstanceEncryptionKey.assertConfigured(env, false);

    // Assert
    expect(result).toThrow("Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY");
  });

  test("should accept a base64 256-bit key under FIPS, from either variable", () => {
    // Setup
    const envs = [{ ENCRYPTION_KEY: BASE64_KEY }, { ROOT_ENCRYPTION_KEY: BASE64_KEY }];

    // Action
    const results = envs.map((env) => () => InstanceEncryptionKey.assertConfigured(env, true));

    // Assert
    results.forEach((result) => expect(result).not.toThrow());
  });

  test("should refuse under FIPS a missing key, a key that is not base64 and a key that is not 256 bits", () => {
    // Setup
    const missing = {};
    const notBase64 = { ENCRYPTION_KEY: "not base64!" };
    const wrongSize = { ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") };

    // Action
    const results = [missing, notBase64, wrongSize].map(
      (env) => () => InstanceEncryptionKey.assertConfigured(env, true)
    );

    // Assert
    expect(results[0]).toThrow("FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not set.");
    expect(results[1]).toThrow("is not a base64 encoded 256-bit key.");
    expect(results[2]).toThrow("is not a 256-bit key.");
  });
});

describe("InstanceEncryptionKey.assertConfiguredForSwitch", () => {
  test("should refuse a switch to software when no key is configured", () => {
    // Setup
    const env = {};

    // Action
    const result = () => InstanceEncryptionKey.assertConfiguredForSwitch(env);

    // Assert
    expect(result).toThrow("before trying to update the encryption strategy to software mode");
  });
});

describe("InstanceEncryptionKey.wrapRootKey and unwrapRootKey", () => {
  test("should unwrap to the root key that was wrapped", () => {
    // Setup
    const kek = InstanceEncryptionKey.fromEnv({ ENCRYPTION_KEY: UTF8_KEY });
    const rootKey = RootKey.generate();

    // Action
    const unwrapped = kek.unwrapRootKey(kek.wrapRootKey(rootKey));

    // Assert
    expect(unwrapped.equals(rootKey)).toBe(true);
  });

  test("should not unwrap under another instance key", () => {
    // Setup
    const wrapped = InstanceEncryptionKey.fromEnv({ ENCRYPTION_KEY: UTF8_KEY }).wrapRootKey(RootKey.generate());
    const other = InstanceEncryptionKey.fromEnv({ ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" });

    // Action
    const result = () => other.unwrapRootKey(wrapped);

    // Assert
    expect(result).toThrow();
  });
});
