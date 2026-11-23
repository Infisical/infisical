import { Knex } from "knex";
import { onTestFinished } from "vitest";

import { ProjectType, TableName } from "@app/db/schemas";
import { poolStoreConnection, ReadFrom, singleStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { OrderByDirection } from "@app/lib/types";

import { DataKey } from "../models/data-key";
import { KmsKey } from "../models/kms-key";
import {
  describeKmsKeyStoreContract,
  newInternalKey,
  rootKeyForTests,
  TKmsKeyStoreFixture
} from "../testing/kms-key-store-contract";
import { KmsKeyStore } from "./kms-key-store";
import { KmsKeyVersionStore } from "./kms-key-version-store";

describe("KmsKeyStore on Postgres", () => {
  const h = setupIntegration();

  const postgresFixture = async (): Promise<TKmsKeyStoreFixture> => ({
    keyStore: new KmsKeyStore(poolStoreConnection(h.db)),
    versionStore: new KmsKeyVersionStore(poolStoreConnection(h.db)),
    newOrg: async () => (await h.factories.organization()).id,
    newProject: async (orgId, { type, pendingDeletion } = {}) =>
      (
        await h.factories.project({
          orgId,
          ...(type ? { type } : {}),
          deleteAfter: pendingDeletion ? new Date() : null
        })
      ).project.id
  });

  describeKmsKeyStoreContract("postgres", postgresFixture);

  describe("read routing", () => {
    const unreachableReplica = () => {
      throw new Error("replica used");
    };

    test("should not touch the replica for a read from the primary or a lock-taking read", async () => {
      const tn = await h.newTenant();
      const key = newInternalKey(tn.org.id, { projectId: tn.project.id });
      await new KmsKeyStore(poolStoreConnection(h.db)).insert(key);
      const store = new KmsKeyStore(poolStoreConnection(h.db, unreachableReplica));
      const primary = { readFrom: ReadFrom.Primary };

      const byId = await store.findById(key.id, primary);
      const filtered = await store.find({ orgId: tn.org.id }, primary);
      const page = await store.listProjectKeys(
        { projectId: tn.project.id, offset: 0, orderBy: "name", orderDirection: OrderByDirection.ASC },
        primary
      );
      const count = await store.countProjectKeysInOrg(tn.org.id, ProjectType.SecretManager, primary);
      const published = await store.findPublishedById(key.id, primary);
      const forUpdate = await store.findForUpdate(key.id);

      expect(byId?.id).toBe(key.id);
      expect(filtered.map((found) => found.id)).toContain(key.id);
      expect(page.totalCount).toBe(1);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(published).toBeNull();
      expect(forUpdate?.id).toBe(key.id);
    });

    test("should read from the replica by default", async () => {
      const tn = await h.newTenant();
      const key = newInternalKey(tn.org.id, { projectId: tn.project.id });
      await new KmsKeyStore(poolStoreConnection(h.db)).insert(key);
      const replica = vi.fn(() => h.db);
      const store = new KmsKeyStore(poolStoreConnection(h.db, replica));

      await store.findById(key.id);

      expect(replica).toHaveBeenCalled();
    });
  });

  const BLOCKED_WRITER_TIMEOUT_MS = 10_000;

  const waitForBlockedQuery = async () => {
    const startedAt = Date.now();
    let waiting = 0;
    while (waiting === 0) {
      // A writer that was never going to block means the lock is missing; fail instead of polling forever.
      if (Date.now() - startedAt > BLOCKED_WRITER_TIMEOUT_MS)
        throw new Error("the second writer never blocked on a row lock");
      // eslint-disable-next-line no-await-in-loop -- polls until the second writer is blocked on the row lock
      const { rows } = await h.db.raw<{ rows: { count: string }[] }>(
        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()"
      );
      waiting = Number(rows[0].count);
    }
  };

  // save writes attributes and material together, so findForUpdate must lock both rows: a writer that read before
  // the other committed would write the other's change back.
  describe("save after a concurrent change", () => {
    const race = async (first: "rotate" | "change", second: "rotate" | "change") => {
      const tn = await h.newTenant();
      const key = newInternalKey(tn.org.id, { projectId: tn.project.id });
      await new KmsKeyStore(poolStoreConnection(h.db)).insert(key);
      const holder = await h.db.transaction();
      const waiter = await h.db.transaction();
      onTestFinished(async () => {
        await Promise.all([holder, waiter].map(async (trx) => (trx.isCompleted() ? undefined : trx.rollback())));
      });
      const stores = (trx: Knex) => ({
        keys: new KmsKeyStore(singleStoreConnection(trx)),
        versions: new KmsKeyVersionStore(singleStoreConnection(trx))
      });

      const firstWork = async (loaded: KmsKey, trx: Knex) => {
        if (first === "rotate") await stores(trx).versions.insert(loaded.rotate(rootKeyForTests).archived);
        else loaded.rename("renamed");
        await stores(trx).keys.save(loaded);
      };
      const secondWork = async (loaded: KmsKey, trx: Knex) => {
        if (second === "rotate") await stores(trx).versions.insert(loaded.rotate(rootKeyForTests).archived);
        else loaded.disable();
        await stores(trx).keys.save(loaded);
      };

      const held = (await stores(holder).keys.findForUpdate(key.id)) as KmsKey;
      const blocked = stores(waiter).keys.findForUpdate(key.id);
      await waitForBlockedQuery();
      await firstWork(held, holder);
      await holder.commit();
      await secondWork((await blocked) as KmsKey, waiter);
      await waiter.commit();
      return key.id;
    };

    test("should keep a disable that followed a rotation, and the rotated material", async () => {
      // Setup
      const id = await race("rotate", "change");

      // Action
      const stored = await new KmsKeyStore(poolStoreConnection(h.db)).findById(id);

      // Assert
      expect(stored?.toJSON()).toMatchObject({ isDisabled: true, internal: { version: 2 } });
    });

    test("should keep a rotation that followed a rename, and the new name", async () => {
      // Setup
      const id = await race("change", "rotate");

      // Action
      const stored = await new KmsKeyStore(poolStoreConnection(h.db)).findById(id);
      const versions = await h
        .db(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId: stored?.toJSON().internal?.id });

      // Assert
      expect(stored?.toJSON()).toMatchObject({ name: "renamed", internal: { version: 2 } });
      expect(versions).toHaveLength(1);
    });
  });
  describe("schema before the April 2025 kms_keys columns", () => {
    test("should restore a key with the defaults a historical migration relies on", async () => {
      // Setup
      const tn = await h.newTenant();
      const key = KmsKey.createReserved({ orgId: tn.org.id, rootKey: rootKeyForTests });
      await new KmsKeyStore(poolStoreConnection(h.db)).insert(key);
      const trx = await h.db.transaction();
      onTestFinished(async () => {
        if (!trx.isCompleted()) await trx.rollback();
      });
      await trx.schema.alterTable(TableName.KmsKey, (t) => {
        t.dropColumn("keyUsage");
        t.dropColumn("isExportable");
        t.dropColumn("hasDeleteProtection");
        t.dropColumn("isPublicKeyPublished");
      });

      // Action
      const restored = await new KmsKeyStore(singleStoreConnection(trx)).findById(key.id);

      // Assert
      expect(restored?.toJSON()).toMatchObject({
        keyUsage: "encrypt-decrypt",
        isExportable: true,
        hasDeleteProtection: false,
        isPublicKeyPublished: false
      });
      const sealed = key.sealDataKey(rootKeyForTests, DataKey.generate());
      expect(() => restored?.openDataKey(rootKeyForTests, sealed)).not.toThrow();
    });
  });

  describe("schema before the delete protection and public key publishing columns", () => {
    test("should insert a key a historical migration creates", async () => {
      // Setup
      const tn = await h.newTenant();
      const trx = await h.db.transaction();
      onTestFinished(async () => {
        if (!trx.isCompleted()) await trx.rollback();
      });
      await trx.schema.alterTable(TableName.KmsKey, (t) => {
        t.dropColumn("hasDeleteProtection");
        t.dropColumn("isPublicKeyPublished");
      });
      const key = KmsKey.createReserved({ orgId: tn.org.id, rootKey: rootKeyForTests });

      // Action
      await new KmsKeyStore(singleStoreConnection(trx)).insert(key);

      // Assert
      const restored = await new KmsKeyStore(singleStoreConnection(trx)).findById(key.id);
      expect(restored?.toJSON()).toMatchObject({ id: key.id, hasDeleteProtection: false, isPublicKeyPublished: false });
    });
  });

  describe("before external_kms.providerInputsVersion exists", () => {
    afterEach(() => KmsKeyStore.resetColumnProbe());

    test("should write and read an external key as legacy inputs", async () => {
      // Setup
      const tn = await h.newTenant();
      KmsKeyStore.resetColumnProbe();
      const trx = await h.db.transaction();
      onTestFinished(async () => {
        if (!trx.isCompleted()) await trx.rollback();
      });
      await trx.schema.alterTable(TableName.ExternalKms, (t) => t.dropColumn("providerInputsVersion"));
      const store = new KmsKeyStore(singleStoreConnection(trx));
      const key = KmsKey.createExternal({
        orgId: tn.org.id,
        name: "aws-key",
        provider: "aws",
        encryptedProviderInputs: Buffer.from("inputs"),
        providerInputsVersion: 2
      });

      // Action
      await store.insert(key);
      const loaded = (await store.findForUpdate(key.id)) as KmsKey;
      loaded.replaceProviderInputs(Buffer.from("new-inputs"), 2, loaded);
      await store.save(loaded);
      const restored = await store.findById(key.id);

      // Assert
      expect(restored?.toJSON().external).toMatchObject({
        encryptedProviderInputs: Buffer.from("new-inputs"),
        providerInputsVersion: 1
      });
    });
  });
});
