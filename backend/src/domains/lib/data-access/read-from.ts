import type { Knex } from "knex";

import type { TDbClient } from "@app/db";

export enum ReadFrom {
  Replica = "replica",
  Primary = "primary"
}

// Last argument of every store fetch. Reads hit a replica unless the caller passes { readFrom: ReadFrom.Primary }
// because it needs a commit that may not have replicated yet.
export type TReadOptions = { readFrom?: ReadFrom };

// Reads follow readFrom. Writes and row locks always go to the primary.
export type TStoreConnection = {
  reader(options?: TReadOptions): Knex;
  writer(): Knex;
};

// `replica` is a getter because replicaNode() picks a replica per call.
export const poolStoreConnection = (db: TDbClient, replica: () => Knex = () => db.replicaNode()): TStoreConnection => ({
  reader: (options) => (options?.readFrom === ReadFrom.Primary ? db : replica()),
  writer: () => db
});

// For a transaction or a migration's connection. readFrom is ignored on purpose: reading anywhere else would miss
// the transaction's uncommitted rows and take a second connection.
export const singleStoreConnection = (knex: Knex): TStoreConnection => ({
  reader: () => knex,
  writer: () => knex
});
