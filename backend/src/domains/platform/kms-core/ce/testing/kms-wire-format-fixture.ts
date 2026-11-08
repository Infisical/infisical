import fixture from "./fixtures/kms-wire-format.json";

type TEncoded = { $buffer: string } | { $date: string } | string | number | boolean | null | Record<string, unknown>;

const decode = (value: TEncoded): unknown => {
  if (value && typeof value === "object" && "$buffer" in value) return Buffer.from(value.$buffer as string, "base64");
  if (value && typeof value === "object" && "$date" in value) return new Date(value.$date as string);
  return value;
};

const decodeRow = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, decode(value as TEncoded)])) as Record<
    string,
    unknown
  >;

const b64 = (value: string | null) => (value ? Buffer.from(value, "base64") : null);

// The rows and vectors the legacy KMS service wrote (scripts/generate-kms-fixtures.ts), decoded.
export const kmsWireFormatFixture = () => ({
  encryptionKey: fixture.env.ENCRYPTION_KEY,
  rows: {
    kmsRootConfig: fixture.rows.kmsRootConfig.map(decodeRow),
    kmsLegacyEncryptionKeys: fixture.rows.kmsLegacyEncryptionKeys.map(decodeRow),
    kmsKekHistory: fixture.rows.kmsKekHistory.map(decodeRow),
    kmsKeys: fixture.rows.kmsKeys.map(decodeRow),
    internalKms: fixture.rows.internalKms.map(decodeRow),
    internalKmsKeyVersions: fixture.rows.internalKmsKeyVersions.map(decodeRow),
    organization: {
      id: fixture.rows.organization.id,
      kmsDefaultKeyId: fixture.rows.organization.kmsDefaultKeyId,
      kmsEncryptedDataKey: b64(fixture.rows.organization.kmsEncryptedDataKey)
    },
    project: {
      id: fixture.rows.project.id,
      orgId: fixture.rows.project.orgId,
      kmsSecretManagerKeyId: fixture.rows.project.kmsSecretManagerKeyId,
      kmsSecretManagerEncryptedDataKey: b64(fixture.rows.project.kmsSecretManagerEncryptedDataKey)
    }
  },
  vectors: fixture.vectors
});

export type TKmsWireFormatFixture = ReturnType<typeof kmsWireFormatFixture>;
