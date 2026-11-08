import { TDataAccessLocks } from "../data-access-locks";
import { InMemoryTransactionRunner, TSnapshotState } from "./in-memory-transaction-runner";

class CounterState implements TSnapshotState {
  values = new Map<string, number>();

  snapshot() {
    return new Map(this.values);
  }

  restore(snapshot: unknown) {
    this.values = new Map(snapshot as Map<string, number>);
  }
}

const newTransactionRunner = () => {
  const state = new CounterState();
  const transactionRunner = new InMemoryTransactionRunner(state, (locks: TDataAccessLocks) => ({ state, locks }));
  return { state, transactionRunner };
};

describe("InMemoryTransactionRunner.run", () => {
  test("should restore the state when the work throws", async () => {
    // Setup
    const { state, transactionRunner } = newTransactionRunner();
    state.values.set("a", 1);

    // Action
    const result = transactionRunner.run(async ({ dataAccess }) => {
      dataAccess.state.values.set("a", 2);
      throw new Error("boom");
    });

    // Assert
    await expect(result).rejects.toThrow("boom");
    expect(state.values.get("a")).toBe(1);
  });

  test("should run afterCommit hooks only when the work succeeds", async () => {
    // Setup
    const { transactionRunner } = newTransactionRunner();
    const ran: string[] = [];

    // Action
    await transactionRunner.run(async ({ tx }) => {
      tx.afterCommit(async () => {
        ran.push("ok");
      });
    });
    await transactionRunner
      .run(async ({ tx }) => {
        tx.afterCommit(async () => {
          ran.push("rolled back");
        });
        throw new Error("boom");
      })
      .catch(() => undefined);

    // Assert
    expect(ran).toEqual(["ok"]);
  });

  test("should join the outer run when bound with within, and roll back with it", async () => {
    // Setup
    const { state, transactionRunner } = newTransactionRunner();

    // Action
    const result = transactionRunner.run(async ({ tx }) => {
      await transactionRunner.within(tx).run(async ({ dataAccess }) => {
        dataAccess.state.values.set("joined", 1);
      });
      throw new Error("outer fails");
    });

    // Assert
    await expect(result).rejects.toThrow("outer fails");
    expect(state.values.has("joined")).toBe(false);
  });

  test("should not run a joined run's afterCommit until the outer run commits", async () => {
    // Setup
    const { transactionRunner } = newTransactionRunner();
    const ran: string[] = [];

    // Action
    await transactionRunner.run(async ({ tx }) => {
      await transactionRunner.within(tx).run(async ({ tx: joined }) => {
        joined.afterCommit(async () => {
          ran.push("joined");
        });
      });
      ran.push("outer still running");
    });

    // Assert
    expect(ran).toEqual(["outer still running", "joined"]);
  });

  test("should serialise two holders of one lock, and not holders of different keys", async () => {
    // Setup
    const { transactionRunner } = newTransactionRunner();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // Action
    const first = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("k");
      order.push("first acquired");
      await firstHolds;
      order.push("first releases");
    });
    await Promise.resolve();
    const other = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("other");
      order.push("other key acquired");
    });
    const second = transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("k");
      order.push("second acquired");
    });
    await other;
    releaseFirst();
    await Promise.all([first, second]);

    // Assert
    expect(order).toEqual(["first acquired", "other key acquired", "first releases", "second acquired"]);
  });

  test("should release a lock when the work throws", async () => {
    // Setup
    const { transactionRunner } = newTransactionRunner();
    await transactionRunner
      .run(async ({ dataAccess }) => {
        await dataAccess.locks.acquire("k");
        throw new Error("boom");
      })
      .catch(() => undefined);

    // Action
    const acquired = await transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.acquire("k");
      return true;
    });

    // Assert
    expect(acquired).toBe(true);
  });
});
