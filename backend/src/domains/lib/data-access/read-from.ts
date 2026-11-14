import type { Knex } from "knex";

import type { TDbClient } from "@app/db";

export enum ReadFrom {
  Replica = "replica",
  Primary = "primary"
}

// The last argument of every store fetch. Reads go to a replica unless the caller passes { readFrom: ReadFrom.Primary }
// because it needs a commit that may not have replicated yet.
export type TReadOptions = { readFrom?: ReadFrom };

// What a store queries through: reads follow the caller's readFrom, writes and row locks always go to the primary.
export type TStoreConnection = {
  reader(options?: TReadOptions): Knex;
  writer(): Knex;
};

// The server's pool. `replica` is a getter because replicaNode() picks a replica per call.
export const poolStoreConnection = (db: TDbClient, replica: () => Knex = () => db.replicaNode()): TStoreConnection => ({
  reader: (options) => (options?.readFrom === ReadFrom.Primary ? db : replica()),
  writer: () => db
});

// One handle for everything: a transaction, or a migration's own connection. readFrom is ignored on purpose: sending
// a read anywhere else would miss the transaction's uncommitted rows and take a second connection.
export const singleStoreConnection = (knex: Knex): TStoreConnection => ({
  reader: () => knex,
  writer: () => knex
});
