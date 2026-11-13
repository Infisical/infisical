import { randomBytes } from "node:crypto";

import { Knex } from "knex";
import { onTestFinished } from "vitest";

import { setupIntegration } from "../testing/integration";
import { sealKnexTransaction } from "./legacy-transaction";
import { TStoreLocks } from "./store-locks";
import { TransactionRunner } from "./transaction-runner";

type TScratchStores = { insert(value: string): Promise<void>; pid(): Promise<number>; locks: TStoreLocks };

describe("TransactionRunner", () => {
  const h = setupIntegration();

  const scratchTable = async () => {
    const table = `it_runner_${randomBytes(4).toString("hex")}`;
    await h.db.schema.createTable(table, (t) => t.string("value"));
    onTestFinished(() => h.db.schema.dropTableIfExists(table));
    const buildStores = (trx: Knex, locks: TStoreLocks): TScratchStores => ({
      insert: async (value) => {
        await trx(table).insert({ value });
      },
      pid: async () => {
        const { rows } = (await trx.raw("SELECT pg_backend_pid() AS pid")) as { rows: { pid: number }[] };
        return rows[0].pid;
      },
      locks
    });
    const values = async () => (await h.db(table).select("value")).map((r: { value: string }) => r.value).sort();
    return { table, runner: new TransactionRunner(h.db, buildStores), values };
  };

  test("should commit every write", async () => {
    // Setup
    const { runner, values } = await scratchTable();

    // Action
    await runner.run(async ({ stores }) => {
      await stores.insert("a");
      await stores.insert("b");
    });

    // Assert
    expect(await values()).toEqual(["a", "b"]);
  });

  test("should roll back every write when the work throws", async () => {
    // Setup
    const { runner, values } = await scratchTable();

    // Action
    const result = runner.run(async ({ stores }) => {
      await stores.insert("a");
      throw new Error("boom");
    });

    // Assert
    await expect(result).rejects.toThrow("boom");
    expect(await values()).toEqual([]);
  });

  test("should run afterCommit after the commit and never after a rollback", async () => {
    // Setup
    const { runner, values } = await scratchTable();
    const seen: string[][] = [];

    // Action
    await runner.run(async ({ stores, tx }) => {
      await stores.insert("a");
      tx.afterCommit(async () => {
        seen.push(await values());
      });
    });
    await runner
      .run(async ({ tx }) => {
        tx.afterCommit(async () => {
          seen.push(["rolled back"]);
        });
        throw new Error("boom");
      })
      .catch(() => undefined);

    // Assert
    expect(seen).toEqual([["a"]]);
  });

  test("should keep the commit when an afterCommit hook throws", async () => {
    // Setup
    const { runner, values } = await scratchTable();

    // Action
    await runner.run(async ({ stores, tx }) => {
      await stores.insert("a");
      tx.afterCommit(async () => {
        throw new Error("hook failed");
      });
    });

    // Assert
    expect(await values()).toEqual(["a"]);
  });

  test("should use one connection when bound with within", async () => {
    // Setup
    const { runner } = await scratchTable();

    // Action
    const [outer, inner] = await runner.run(async ({ stores, tx }) => {
      const joined = await runner.within(tx).run(({ stores: s }) => s.pid());
      return [await stores.pid(), joined];
    });

    // Assert
    expect(inner).toBe(outer);
  });

  test("should hold a store lock until the transaction that took it ends", async () => {
    // Setup
    const { runner, values } = await scratchTable();
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });

    // Action
    const first = runner.run(async ({ stores }) => {
      await stores.locks.acquire("k");
      firstLocked();
      await firstHolds;
      await stores.insert("first");
    });
    await locked;
    const second = runner.run(async ({ stores }) => {
      await stores.locks.acquire("k");
      await stores.insert(`second saw ${(await values()).join(",") || "nothing"}`);
    });
    releaseFirst();
    await Promise.all([first, second]);

    // Assert
    expect(await values()).toEqual(["first", "second saw first"]);
  });
});

describe("sealKnexTransaction", () => {
  const h = setupIntegration();

  const scratch = async () => {
    const table = `it_legacy_${randomBytes(4).toString("hex")}`;
    await h.db.schema.createTable(table, (t) => t.string("value"));
    onTestFinished(() => h.db.schema.dropTableIfExists(table));
    const runner = new TransactionRunner(h.db, (trx) => ({
      insert: async (value: string) => {
        await trx(table).insert({ value });
      }
    }));
    const values = async () => (await h.db(table).select("value")).map((r: { value: string }) => r.value).sort();
    return { runner, values, table };
  };

  test("should join a legacy transaction and roll back with it", async () => {
    // Setup
    const { runner, values, table } = await scratch();

    // Action
    const result = h.db.transaction(async (trx) => {
      await trx(table).insert({ value: "legacy" });
      await runner.within(sealKnexTransaction(trx)).run(({ stores }) => stores.insert("domain"));
      throw new Error("legacy fails");
    });

    // Assert
    await expect(result).rejects.toThrow("legacy fails");
    expect(await values()).toEqual([]);
  });

  test("should commit with the legacy transaction", async () => {
    // Setup
    const { runner, values, table } = await scratch();

    // Action
    await h.db.transaction(async (trx) => {
      await trx(table).insert({ value: "legacy" });
      await runner.within(sealKnexTransaction(trx)).run(({ stores }) => stores.insert("domain"));
    });

    // Assert
    expect(await values()).toEqual(["domain", "legacy"]);
  });

  test("should join a nested legacy transaction, as a caller passing its transaction to project create does", async () => {
    // Setup
    const { runner, values, table } = await scratch();

    // Action
    const result = h.db.transaction(async (outer) => {
      await outer.transaction(async (inner) => {
        await inner(table).insert({ value: "legacy" });
        await runner.within(sealKnexTransaction(inner)).run(({ stores }) => stores.insert("domain"));
      });
      throw new Error("outer fails");
    });

    // Assert
    await expect(result).rejects.toThrow("outer fails");
    expect(await values()).toEqual([]);
  });

  test("should refuse afterCommit, since a nested legacy transaction only sees its savepoint", async () => {
    // Setup
    const { runner } = await scratch();

    // Action
    const result = h.db.transaction(async (trx) =>
      runner.within(sealKnexTransaction(trx)).run(async ({ tx }) => tx.afterCommit(async () => undefined))
    );

    // Assert
    await expect(result).rejects.toThrow("afterCommit is not available");
  });

  test("should refuse the connection pool", () => {
    // Action
    const seal = () => sealKnexTransaction(h.db);

    // Assert
    expect(seal).toThrow("needs a Knex transaction");
  });
});
