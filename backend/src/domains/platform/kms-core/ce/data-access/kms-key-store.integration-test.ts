import { Knex } from "knex";
import { onTestFinished } from "vitest";

import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

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
    keyStore: new KmsKeyStore(() => h.db),
    versionStore: new KmsKeyVersionStore(() => h.db),
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

  // save writes the attributes and the material together, so each finder must hold both rows' locks: a writer that
  // read before the other committed would write the other's change back.
  describe("save after a concurrent change", () => {
    const race = async (first: "findForRotation" | "findForUpdate", second: "findForRotation" | "findForUpdate") => {
      const tn = await h.newTenant();
      const key = newInternalKey(tn.org.id, { projectId: tn.project.id });
      await new KmsKeyStore(() => h.db).insert(key);
      const holder = await h.db.transaction();
      const waiter = await h.db.transaction();
      onTestFinished(async () => {
        await Promise.all([holder, waiter].map(async (trx) => (trx.isCompleted() ? undefined : trx.rollback())));
      });
      const stores = (trx: Knex) => ({ keys: new KmsKeyStore(() => trx), versions: new KmsKeyVersionStore(() => trx) });

      const firstWork = async (loaded: KmsKey, trx: Knex) => {
        if (first === "findForRotation") await stores(trx).versions.insert(loaded.rotate(rootKeyForTests));
        else loaded.rename("renamed");
        await stores(trx).keys.save(loaded);
      };
      const secondWork = async (loaded: KmsKey, trx: Knex) => {
        if (second === "findForRotation") await stores(trx).versions.insert(loaded.rotate(rootKeyForTests));
        else loaded.disable();
        await stores(trx).keys.save(loaded);
      };

      const held = (await stores(holder).keys[first](key.id)) as KmsKey;
      const blocked = stores(waiter).keys[second](key.id);
      await waitForBlockedQuery();
      await firstWork(held, holder);
      await holder.commit();
      await secondWork((await blocked) as KmsKey, waiter);
      await waiter.commit();
      return key.id;
    };

    test("should keep a disable that followed a rotation, and the rotated material", async () => {
      // Setup
      const id = await race("findForRotation", "findForUpdate");

      // Action
      const stored = await new KmsKeyStore(() => h.db).findById(id);

      // Assert
      expect(stored?.toJSON()).toMatchObject({ isDisabled: true, internal: { version: 2 } });
    });

    test("should keep a rotation that followed a rename, and the new name", async () => {
      // Setup
      const id = await race("findForUpdate", "findForRotation");

      // Action
      const stored = await new KmsKeyStore(() => h.db).findById(id);
      const versions = await h
        .db(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId: stored?.toJSON().internal?.id });

      // Assert
      expect(stored?.toJSON()).toMatchObject({ name: "renamed", internal: { version: 2 } });
      expect(versions).toHaveLength(1);
    });
  });
});
