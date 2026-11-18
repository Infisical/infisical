import { setupIntegration } from "@app/domains/lib/testing/integration";

import { buildPostgresKmsCore } from "../testing/build-kms-core";
import { kmsWireFormatFixture } from "../testing/kms-wire-format-fixture";
import { loadFixtureIntoPostgres } from "../testing/load-kms-wire-format-fixture";
import { KmsDataKey } from "./data-key/service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const b64 = (value: string) => Buffer.from(value, "base64");

// The fixture replaces the instance's root config, so the test gets a private database.
describe("KMS wire format on Postgres", () => {
  const h = setupIntegration({ freshDatabase: true });

  test("should decrypt the data the legacy service wrote in this database's fixtures", async () => {
    // Setup
    const fixture = kmsWireFormatFixture();
    await loadFixtureIntoPostgres(fixture, h.db);
    const module = await buildPostgresKmsCore(h.db, { env: { ENCRYPTION_KEY: fixture.encryptionKey } });
    const { orgDataKey, projectDataKey, cmek } = fixture.vectors;

    // Action
    const org = await module.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgDataKey.orgId
    });
    const project = await module.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: projectDataKey.projectId
    });
    const cmekDecrypt = await module.kmsKeyService.decryptWithKmsKey({ kmsId: cmek.kmsId });

    // Assert
    expect(org.decryptor({ cipherTextBlob: b64(orgDataKey.cipherTextBlob) })).toEqual(b64(orgDataKey.plainText));
    expect(project.decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
    expect(await cmekDecrypt({ cipherTextBlob: b64(cmek.v01.cipherTextBlob) })).toEqual(b64(cmek.v01.plainText));
    expect(await cmekDecrypt({ cipherTextBlob: b64(cmek.v02.cipherTextBlob) })).toEqual(b64(cmek.v02.plainText));
  });
});
