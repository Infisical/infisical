import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TMemberNames, TMemberNameStore } from "../services/dependencies";

// Reads users and identities, which no domain owns yet: a declared exception (see ../../AGENTS.md). Only the names a
// member listing shows.
export class MemberNameStore implements TMemberNameStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findNames(
    { userIds, identityIds }: { userIds: string[]; identityIds: string[] },
    options?: TReadOptions
  ): Promise<TMemberNames> {
    try {
      const knex = this.connection.reader(options);
      const [users, identities] = await Promise.all([
        userIds.length
          ? knex(TableName.Users).whereIn("id", userIds).where("isGhost", false).select("id", "username")
          : Promise.resolve([] as { id: string; username: string }[]),
        identityIds.length
          ? knex(TableName.Identity).whereIn("id", identityIds).select("id", "name")
          : Promise.resolve([] as { id: string; name: string }[])
      ]);
      return {
        users: new Map(users.map((row) => [row.id, row.username])),
        identities: new Map(identities.map((row) => [row.id, row.name]))
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find member names" });
    }
  }
}
