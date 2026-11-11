import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

// Reads users and identities, which no domain owns yet: a declared exception (see ../../AGENTS.md). Only the names a
// member listing shows.
export class MemberNameDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // Usernames of the users that are not ghosts (a ghost user stands in for a deleted account), and identity names.
  async findNames({
    userIds,
    identityIds
  }: {
    userIds: string[];
    identityIds: string[];
  }): Promise<{ users: Map<string, string>; identities: Map<string, string> }> {
    try {
      const knex = this.db.reader();
      const [users, identities] = await Promise.all([
        userIds.length
          ? knex(TableName.Users).whereIn("id", userIds).where("isGhost", false).select("id", "username")
          : [],
        identityIds.length ? knex(TableName.Identity).whereIn("id", identityIds).select("id", "name") : []
      ]);
      return {
        users: new Map(users.map((row: { id: string; username: string }) => [row.id, row.username])),
        identities: new Map(identities.map((row: { id: string; name: string }) => [row.id, row.name]))
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find member names" });
    }
  }
}
