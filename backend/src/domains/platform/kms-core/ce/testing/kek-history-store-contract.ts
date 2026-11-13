import { DatabaseError } from "@app/lib/errors";

import { KekHistoryEntry } from "../models/kek-history-entry";
import { TKekHistoryStore } from "../services/dependencies";

type TSetup = () => Promise<{ store: TKekHistoryStore }>;

const entry = (kekLabel: string, activatedAt: string) =>
  KekHistoryEntry.create({ kekLabel, activatedAt: new Date(activatedAt) });

export const describeKekHistoryStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} KEK history contract`, () => {
    test("should return what was inserted", async () => {
      // Setup
      const { store } = await setup();
      const created = entry("a", "2030-01-01T00:00:00.000Z");

      // Action
      await store.insert(created);
      const found = await store.findCurrent();

      // Assert
      expect(found?.id).toBe(created.id);
      expect(found?.kekLabel).toBe("a");
      expect(found?.activatedAt).toEqual(created.activatedAt);
    });

    test("should return null when there is no current entry", async () => {
      // Setup
      const { store } = await setup();

      // Action
      const result = await Promise.all([store.findCurrent(), store.findActiveByLabel("missing")]);

      // Assert
      expect(result).toEqual([null, null]);
    });

    test("should page newest first and count every entry", async () => {
      // Setup
      const { store } = await setup();
      await store.insert(entry("oldest", "2030-01-01T00:00:00.000Z"));
      await store.insert(entry("newest", "2030-03-01T00:00:00.000Z"));
      await store.insert(entry("middle", "2030-02-01T00:00:00.000Z"));

      // Action
      const [firstPage, secondPage, count] = await Promise.all([
        store.findPage({ offset: 0, limit: 2 }),
        store.findPage({ offset: 2, limit: 2 }),
        store.count()
      ]);

      // Assert
      expect(firstPage.map((row) => row.kekLabel)).toEqual(["newest", "middle"]);
      expect(secondPage.map((row) => row.kekLabel)).toEqual(["oldest"]);
      expect(count).toBe(3);
    });

    test("should persist a supersede and a retire", async () => {
      // Setup
      const { store } = await setup();
      const created = entry("a", "2030-01-01T00:00:00.000Z");
      await store.insert(created);
      const supersededAt = new Date("2030-02-01T00:00:00.000Z");
      const retiredAt = new Date("2030-03-01T00:00:00.000Z");

      // Action
      created.supersede(supersededAt);
      await store.save(created);
      created.retire(retiredAt);
      await store.save(created);

      // Assert
      const [row] = await store.findPage({ offset: 0, limit: 1 });
      expect(row.toJSON()).toMatchObject({ supersededAt, retiredAt });
    });

    test("should find the current entry as the newest one that is not superseded", async () => {
      // Setup
      const { store } = await setup();
      const old = entry("old", "2030-01-01T00:00:00.000Z");
      await store.insert(old);
      await store.insert(entry("new", "2030-02-01T00:00:00.000Z"));
      old.supersede(new Date("2030-02-01T00:00:00.000Z"));
      await store.save(old);

      // Action
      const current = await store.findCurrent();

      // Assert
      expect(current?.kekLabel).toBe("new");
    });

    test("should find an entry by label only until it is retired", async () => {
      // Setup
      const { store } = await setup();
      const created = entry("a", "2030-01-01T00:00:00.000Z");
      await store.insert(created);
      const before = await store.findActiveByLabel("a");

      // Action
      created.retire(new Date());
      await store.save(created);
      const after = await store.findActiveByLabel("a");

      // Assert
      expect(before?.id).toBe(created.id);
      expect(after).toBeNull();
    });

    test("should refuse to insert the same entry twice", async () => {
      // Setup
      const { store } = await setup();
      const created = entry("a", "2030-01-01T00:00:00.000Z");
      await store.insert(created);

      // Action
      const result = store.insert(created);

      // Assert
      await expect(result).rejects.toBeInstanceOf(DatabaseError);
      expect(await store.count()).toBe(1);
    });
  });
};
