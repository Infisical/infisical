import { Knex } from "knex";

import { TDbClient } from "@app/db";

export enum ReadFrom {
  Replica = "replica",
  Primary = "primary"
}

// Every fetch method on a data access class takes these last. Reads go to the replica unless the caller needs to
// see a commit that may not have replicated yet.
export type TReadOptions = { readFrom?: ReadFrom };

// The connections a data access class reads and writes through. Fetches take reader(options), writes take writer(),
// so a caller chooses primary or replica per read and can never write to the replica.
export class DataAccessDb {
  private constructor(
    private readonly primary: Knex,
    private readonly replica: () => Knex
  ) {}

  // The server's client: reads go to its replica unless a read asks for the primary.
  static fromClient(db: TDbClient): DataAccessDb {
    return new DataAccessDb(db, () => db.replicaNode());
  }

  // One connection for everything: a transaction, or a migration's own connection, which must never be swapped for
  // the global replica that db/instance.ts installs.
  static single(conn: Knex): DataAccessDb {
    return new DataAccessDb(conn, () => conn);
  }

  reader(options?: TReadOptions): Knex {
    return options?.readFrom === ReadFrom.Primary ? this.primary : this.replica();
  }

  writer(): Knex {
    return this.primary;
  }
}
