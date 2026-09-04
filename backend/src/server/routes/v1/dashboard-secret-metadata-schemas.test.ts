import { SecretMetadataQuerySchema, SecretMetadataResponseSchema } from "./dashboard-secret-metadata-schemas";

const query = { projectId: "11111111-1111-4111-8111-111111111111", environment: "dev" };

describe("secret metadata API contract", () => {
  test("defaults to a bounded recursive page and normalizes trailing slashes", () => {
    expect(SecretMetadataQuerySchema.parse(query)).toEqual({ ...query, secretPath: "/", offset: 0, limit: 500 });
    expect(SecretMetadataQuerySchema.parse({ ...query, secretPath: "/app/", offset: "500", limit: "100" })).toEqual({
      ...query,
      secretPath: "/app",
      offset: 500,
      limit: 100
    });
  });

  test.each([
    { projectId: "bad" },
    { environment: "a".repeat(65) },
    { secretPath: "relative" },
    { secretPath: "/bad\0" },
    { secretPath: `/${"a".repeat(6144)}` },
    { offset: -1 },
    { offset: 1.5 },
    { limit: 501 },
    { limit: 0 }
  ])("rejects invalid or unbounded input: %j", (invalid) => {
    expect(SecretMetadataQuerySchema.safeParse({ ...query, ...invalid }).success).toBe(false);
  });

  test("strips secret values and unrelated properties from the response", () => {
    const result = SecretMetadataResponseSchema.parse({
      secrets: [
        {
          id: query.projectId,
          secretKey: "KEY",
          secretPath: "/",
          type: "shared",
          isHoneyTokenSecret: false,
          isRotatedSecret: false,
          secretValueHidden: false,
          secretValue: "private",
          encryptedValue: "private",
          secretComment: "private"
        }
      ],
      nextOffset: null
    });
    expect(result.secrets[0]).not.toHaveProperty("secretValue");
    expect(result.secrets[0]).not.toHaveProperty("encryptedValue");
    expect(result.secrets[0]).not.toHaveProperty("secretComment");
  });
});
