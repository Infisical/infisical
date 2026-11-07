import { TStoreLocks } from "../store-locks";
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

const newRunner = () => {
  const state = new CounterState();
  const runner = new InMemoryTransactionRunner(state, (locks: TStoreLocks) => ({ state, locks }));
  return { state, runner };
};

describe("InMemoryTransactionRunner.run", () => {
  test("should restore the store when the work throws", async () => {
    // Setup
    const { state, runner } = newRunner();
    state.values.set("a", 1);

    // Action
    const result = runner.run(async ({ store }) => {
      store.state.values.set("a", 2);
      throw new Error("boom");
    });

    // Assert
    await expect(result).rejects.toThrow("boom");
    expect(state.values.get("a")).toBe(1);
  });

  test("should run afterCommit hooks only when the work succeeds", async () => {
    // Setup
    const { runner } = newRunner();
    const ran: string[] = [];

    // Action
    await runner.run(async ({ tx }) => {
      tx.afterCommit(async () => {
        ran.push("ok");
      });
    });
    await runner
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
    const { state, runner } = newRunner();

    // Action
    const result = runner.run(async ({ tx }) => {
      await runner.within(tx).run(async ({ store }) => {
        store.state.values.set("joined", 1);
      });
      throw new Error("outer fails");
    });

    // Assert
    await expect(result).rejects.toThrow("outer fails");
    expect(state.values.has("joined")).toBe(false);
  });

  test("should not run a joined run's afterCommit until the outer run commits", async () => {
    // Setup
    const { runner } = newRunner();
    const ran: string[] = [];

    // Action
    await runner.run(async ({ tx }) => {
      await runner.within(tx).run(async ({ tx: joined }) => {
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
    const { runner } = newRunner();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // Action
    const first = runner.run(async ({ store }) => {
      await store.locks.acquire("k");
      order.push("first acquired");
      await firstHolds;
      order.push("first releases");
    });
    await Promise.resolve();
    const other = runner.run(async ({ store }) => {
      await store.locks.acquire("other");
      order.push("other key acquired");
    });
    const second = runner.run(async ({ store }) => {
      await store.locks.acquire("k");
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
    const { runner } = newRunner();
    await runner
      .run(async ({ store }) => {
        await store.locks.acquire("k");
        throw new Error("boom");
      })
      .catch(() => undefined);

    // Action
    const acquired = await runner.run(async ({ store }) => {
      await store.locks.acquire("k");
      return true;
    });

    // Assert
    expect(acquired).toBe(true);
  });

  test("should fail when a second top-level run opens inside an active one", async () => {
    // Setup
    const { runner } = newRunner();

    // Action
    const result = runner.run(async () => runner.run(async () => "nested"));

    // Assert
    await expect(result).rejects.toThrow("A second top-level transaction was opened inside an active one");
  });

  test("should allow a run from work the outer run started but did not await, once the outer run has ended", async () => {
    // Setup
    const { runner } = newRunner();
    let later!: () => Promise<string>;
    await runner.run(async () => {
      later = () => runner.run(async () => "later");
    });

    // Action
    const result = await later();

    // Assert
    expect(result).toBe("later");
  });
});
