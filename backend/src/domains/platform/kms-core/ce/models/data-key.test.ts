import { randomBytes } from "node:crypto";

import { DataKey } from "./data-key";

describe("DataKey", () => {
  test("should decrypt what it encrypted", () => {
    const key = DataKey.generate();

    const blob = key.encrypt(Buffer.from("secret"));

    expect(key.decrypt(blob).toString()).toBe("secret");
  });

  test("should end every blob with the v01 trailer", () => {
    const blob = DataKey.generate().encrypt(Buffer.from("secret"));

    expect(blob.subarray(-3).toString("utf8")).toBe("v01");
  });

  test("should decrypt a blob written by a key rebuilt from the same bytes", () => {
    const bytes = randomBytes(32);
    const blob = DataKey.fromBytes(bytes).encrypt(Buffer.from("secret"));

    expect(DataKey.fromBytes(Buffer.from(bytes)).decrypt(blob).toString()).toBe("secret");
  });

  test("should not decrypt with another key", () => {
    const blob = DataKey.generate().encrypt(Buffer.from("secret"));

    expect(() => DataKey.generate().decrypt(blob)).toThrow();
  });

  test("should give a cipher pair that round trips through the same key", () => {
    const key = DataKey.generate();
    const pair = key.toCipherPair();

    const { cipherTextBlob } = pair.encryptor({ plainText: Buffer.from("value") });

    expect(pair.decryptor({ cipherTextBlob }).toString()).toBe("value");
    expect(key.decrypt(cipherTextBlob).toString()).toBe("value");
  });

  test("should give a blind index that is stable for one key and differs between keys", async () => {
    const bytes = randomBytes(32);
    const first = DataKey.fromBytes(bytes).toCipherPair();
    const second = DataKey.fromBytes(Buffer.from(bytes)).toCipherPair();

    const index = await first.generateSecretBlindIndex(Buffer.from("value"));

    expect(await second.generateSecretBlindIndex(Buffer.from("value"))).toBe(index);
    expect(await DataKey.generate().toCipherPair().generateSecretBlindIndex(Buffer.from("value"))).not.toBe(index);
    expect(await first.generateSecretBlindIndex(Buffer.from("other"))).not.toBe(index);
  });

  test("should export its bytes for wrapping", () => {
    const bytes = randomBytes(32);

    expect(DataKey.fromBytes(bytes).exportForWrapping()).toEqual(bytes);
  });
});
