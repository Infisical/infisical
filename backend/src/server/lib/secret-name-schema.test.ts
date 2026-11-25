import { describe, expect, test } from "vitest";

import { BaseSecretNameSchema, SECRET_NAME_MAX_LENGTH, SecretNameSchema } from "./schemas";

const EMOJI = "\u{1F511}";

describe("secret name length", () => {
  test("accepts a stored name that fills the column with emoji", () => {
    const name = EMOJI.repeat(SECRET_NAME_MAX_LENGTH);
    expect(name.length).toBe(SECRET_NAME_MAX_LENGTH * 2);

    expect(BaseSecretNameSchema.safeParse(name).success).toBe(true);
    expect(SecretNameSchema.safeParse(name).success).toBe(true);
  });

  test("refuses a name one character over the column", () => {
    for (const name of ["a".repeat(SECRET_NAME_MAX_LENGTH + 1), EMOJI.repeat(SECRET_NAME_MAX_LENGTH + 1)]) {
      const result = SecretNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Secret name must be 500 or fewer characters");
    }
  });

  test("accepts a plain name at the limit", () => {
    expect(SecretNameSchema.safeParse("a".repeat(SECRET_NAME_MAX_LENGTH)).success).toBe(true);
  });
});
