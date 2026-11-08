import { randomBytes } from "node:crypto";

import { onTestFinished } from "vitest";

import { DataAccessDb } from "./data-access-db";
import { TDataAccessLocks } from "./data-access-locks";
import { setupIntegration } from "./testing/integration";
import { TransactionRunner } from "./transaction-runner";

type TScratchDataAccess = { insert(value: string): Promise<void>; pid(): Promise<number>; locks: TDataAccessLocks };

describe("TransactionRunner", () => {
  const h = setupIntegration();

  const scratchTable = async () => {
    const table = `it_runner_${randomBytes(4).toString("hex")}`;
    await h.db.schema.createTable(table, (t) => t.string("value"));
    onTestFinished(() => h.db.schema.dropTableIfExists(table));
    const buildDataAccess = (db: DataAccessDb, locks: TDataAccessLocks): TScratchDataAccess => ({
      insert: async (value) => {
        await db.writer()(table).insert({ value });
      },
      pid: async () => {
        const { rows } = (await db.writer().raw("SELECT pg_backend_pid() AS pid")) as { rows: { pid: number }[] };
        return rows[0].pid;
      },
      locks
    });
    const values = async () => (await h.db(table).select("value")).map((r: { value: string }) => r.value).sort();
    return { table, transactionRunner: new TransactionRunner(DataAccessDb.fromClient(h.db), buildDataAccess), values };
  };

  test("should commit every write", async () => {
    // Setup
    const { transactionRunner, values } = await scratchTable();

    // Action
    await transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.insert("a");
      await dataAccess.insert("b");
    });

    // Assert
    expect(await values()).toEqual(["a", "b"]);
  });

  test("should roll back every write when the work throws", async () => {
    // Setup
    const { transactionRunner, values } = await scratchTable();

    // Action
    const result = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.insert("a");
      throw new Error("boom");
    });

    // Assert
    await expect(result).rejects.toThrow("boom");
    expect(await values()).toEqual([]);
  });

  test("should run afterCommit after the commit and never after a rollback", async () => {
    // Setup
    const { transactionRunner, values } = await scratchTable();
    const seen: string[][] = [];

    // Action
    await transactionRunner.run(async ({ dataAccess, tx }) => {
      await dataAccess.insert("a");
      tx.afterCommit(async () => {
        seen.push(await values());
      });
    });
    await transactionRunner
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
    const { transactionRunner, values } = await scratchTable();

    // Action
    await transactionRunner.run(async ({ dataAccess, tx }) => {
      await dataAccess.insert("a");
      tx.afterCommit(async () => {
        throw new Error("hook failed");
      });
    });

    // Assert
    expect(await values()).toEqual(["a"]);
  });

  test("should use one connection when bound with within", async () => {
    // Setup
    const { transactionRunner } = await scratchTable();

    // Action
    const [outer, inner] = await transactionRunner.run(async ({ dataAccess, tx }) => {
      const joined = await transactionRunner.within(tx).run(({ dataAccess: s }) => s.pid());
      return [await dataAccess.pid(), joined];
    });

    // Assert
    expect(inner).toBe(outer);
  });

  test("should hold a data access lock until the transaction that took it ends", async () => {
    // Setup
    const { transactionRunner, values } = await scratchTable();
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });

    // Action
    const first = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("k");
      firstLocked();
      await firstHolds;
      await dataAccess.insert("first");
    });
    await locked;
    const second = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("k");
      await dataAccess.insert(`second saw ${(await values()).join(",") || "nothing"}`);
    });
    releaseFirst();
    await Promise.all([first, second]);

    // Assert
    expect(await values()).toEqual(["first", "second saw first"]);
  });
});
