import type { Knex } from "knex";

import type { TDbClient } from "@app/db";

import { poolStoreConnection, ReadFrom, singleStoreConnection } from "./read-from";

describe("store connections", () => {
  test("should read the replica by default and the primary when asked, and always write to the primary", () => {
    // Setup
    const replica = {} as Knex;
    const primary = { replicaNode: () => replica } as unknown as TDbClient;
    const connection = poolStoreConnection(primary);

    // Action
    const byDefault = connection.reader();
    const onReplica = connection.reader({ readFrom: ReadFrom.Replica });
    const onPrimary = connection.reader({ readFrom: ReadFrom.Primary });

    // Assert
    expect(byDefault).toBe(replica);
    expect(onReplica).toBe(replica);
    expect(onPrimary).toBe(primary);
    expect(connection.writer()).toBe(primary);
  });

  test("should keep every read on a single handle, whatever readFrom asks for", () => {
    // Setup
    const trx = {} as Knex;
    const connection = singleStoreConnection(trx);

    // Action
    const onPrimary = connection.reader({ readFrom: ReadFrom.Primary });
    const byDefault = connection.reader();

    // Assert
    expect(onPrimary).toBe(trx);
    expect(byDefault).toBe(trx);
    expect(connection.writer()).toBe(trx);
  });
});
