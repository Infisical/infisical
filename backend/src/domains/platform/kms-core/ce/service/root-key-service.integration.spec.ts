import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { KMS_ROOT_CONFIG_UUID } from "../model/root-key-config";
import { KmsDataKey } from "../module";
import { buildPostgresKmsCore } from "../testing/build-postgres-kms-core";
import { kmsWireFormatFixture } from "../testing/kms-wire-format-fixture";
import { loadFixtureIntoPostgres } from "../testing/load-kms-wire-format-fixture";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const b64 = (value: string) => Buffer.from(value, "base64");

// Root key state is instance-wide, so each test gets a private database.
describe("RootKeyService on Postgres", () => {
  const h = setupIntegration({ freshDatabase: true });

  const emptyRootKeyTables = async () => {
    await h.db(TableName.KmsServerRootConfig).delete();
    await h.db(TableName.KmsKekHistory).delete();
    await h.db(TableName.KmsLegacyEncryptionKey).delete();
  };

  test("should bootstrap exactly one root config when two modules start at once", async () => {
    // Setup
    await emptyRootKeyTables();
    const first = buildPostgresKmsCore(h.db);
    const second = buildPostgresKmsCore(h.db);

    // Action
    await Promise.all([first.start(), second.start()]);

    // Assert
    expect(await h.db(TableName.KmsServerRootConfig).select("id")).toEqual([{ id: KMS_ROOT_CONFIG_UUID }]);
    expect(first.service.getCookieSigningKey()).toBe(second.service.getCookieSigningKey());
  });

  test("should resolve the same root key on restart", async () => {
    // Setup
    await emptyRootKeyTables();
    const first = buildPostgresKmsCore(h.db);
    await first.start();
    const blob = first.service.encryptWithRootKey()(Buffer.from("restart"));

    // Action
    const restarted = buildPostgresKmsCore(h.db);
    await restarted.start();

    // Assert
    expect(restarted.service.decryptWithRootKey()(blob).toString()).toBe("restart");
  });

  test("should promote a staged rotation on boot with the new key and record it in the KEK history", async () => {
    // Setup
    await emptyRootKeyTables();
    const current = buildPostgresKmsCore(h.db);
    await current.start();
    const blob = current.service.encryptWithRootKey()(Buffer.from("survives rotation"));
    const { key, label } = await current.service.createRotation({});

    // Action
    const rotated = buildPostgresKmsCore(h.db, { env: { ENCRYPTION_KEY: key } });
    await rotated.start();

    // Assert
    expect(rotated.service.decryptWithRootKey()(blob).toString()).toBe("survives rotation");
    expect((await rotated.service.getRootKey()).active.label).toBe(label);
    expect((await rotated.service.listRotations({ offset: 0, limit: 5 })).rotations[0].label).toBe(label);
  });

  test("should still boot a straggler on the retained key after a promotion", async () => {
    // Setup
    await emptyRootKeyTables();
    const current = buildPostgresKmsCore(h.db);
    await current.start();
    const { key } = await current.service.createRotation({});
    await buildPostgresKmsCore(h.db, { env: { ENCRYPTION_KEY: key } }).start();

    // Action
    const straggler = buildPostgresKmsCore(h.db);
    await straggler.start();

    // Assert
    const retained = await h.db(TableName.KmsServerRootConfig).whereNotNull("supersededAt").first();
    expect(retained?.lastResolvedAt).toBeTruthy();
  });

  test("should decrypt the data the legacy service wrote in this database's fixtures", async () => {
    // Setup
    const fixture = kmsWireFormatFixture();
    await loadFixtureIntoPostgres(fixture, h.db);
    const module = buildPostgresKmsCore(h.db, { env: { ENCRYPTION_KEY: fixture.encryptionKey } });
    await module.start();
    const { orgDataKey, projectDataKey, cmek } = fixture.vectors;

    // Action
    const org = await module.service.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgDataKey.orgId
    });
    const project = await module.service.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: projectDataKey.projectId
    });
    const cmekDecrypt = await module.service.decryptWithKmsKey({ kmsId: cmek.kmsId });

    // Assert
    expect(org.decryptor({ cipherTextBlob: b64(orgDataKey.cipherTextBlob) })).toEqual(b64(orgDataKey.plainText));
    expect(project.decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
    expect(await cmekDecrypt({ cipherTextBlob: b64(cmek.v01.cipherTextBlob) })).toEqual(b64(cmek.v01.plainText));
    expect(await cmekDecrypt({ cipherTextBlob: b64(cmek.v02.cipherTextBlob) })).toEqual(b64(cmek.v02.plainText));
  });
});
