import { crypto } from "@app/lib/crypto/cryptography";

import { WrappedKeyPayload } from "./wrapped-key";

describe("WrappedKeyPayload.open", () => {
  test("should return the key for the label it was built for", () => {
    // Setup
    const key = crypto.randomBytes(32);
    const payload = WrappedKeyPayload.build("label-a", key);

    // Action
    const opened = payload.open("label-a", 32);

    // Assert
    expect(opened).toEqual(key);
  });

  test.each([
    ["longer than expected", 33],
    ["shorter than expected", 31]
  ])("should return null for a payload %s", (_name, expectedKeyBytes) => {
    // Setup
    const payload = WrappedKeyPayload.build("label-a", crypto.randomBytes(32));

    // Action
    const opened = payload.open("label-a", expectedKeyBytes);

    // Assert
    expect(opened).toBeNull();
  });

  test("should return null for a payload with the right label hash but the wrong size", () => {
    // Setup
    const payload = WrappedKeyPayload.restore(WrappedKeyPayload.build("label-a", crypto.randomBytes(16)).payload);

    // Action
    const opened = payload.open("label-a", 32);

    // Assert
    expect(opened).toBeNull();
  });
});
