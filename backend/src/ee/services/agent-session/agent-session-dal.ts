import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentSessionDALFactory = ReturnType<typeof agentSessionDALFactory>;

export const agentSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentSession);

  // Members of one org whose email or username matches, case-insensitively. Both columns are checked
  // because SSO users are commonly stored with the email as the username and a null email, and the org
  // membership join is what makes "one email, one person" true: users.email is not unique.
  const findOrgUsersByEmail = async (orgId: string, email: string) => {
    try {
      return await db
        .replicaNode()(TableName.Users)
        .join(TableName.Membership, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.isActive`, true)
        .where(`${TableName.Users}.isGhost`, false)
        .where((qb) => {
          void qb
            .whereRaw(`lower("${TableName.Users}"."email") = ?`, [email])
            .orWhereRaw(`lower("${TableName.Users}"."username") = ?`, [email]);
        })
        .select(selectAllTableCols(TableName.Users))
        .distinctOn(`${TableName.Users}.id`);
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentSession}: FindOrgUsersByEmail` });
    }
  };

  // The sessions live in a project, newest activity first, so the list reads as "who is acting right
  // now". Revoked rows are kept in the result: a session that was just killed is the one an operator is
  // most likely looking for. tokenHash is never selected, so it cannot leak through a caller.
  const findByProjectId = async (projectId: string, limit: number) => {
    try {
      return await db
        .replicaNode()(TableName.AgentSession)
        .where(`${TableName.AgentSession}.projectId`, projectId)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.AgentSession}.identityId`)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.AgentSession}.userId`)
        .select(
          db.ref("id").withSchema(TableName.AgentSession),
          db.ref("identityId").withSchema(TableName.AgentSession),
          db.ref("userId").withSchema(TableName.AgentSession),
          db.ref("projectId").withSchema(TableName.AgentSession),
          db.ref("createdAt").withSchema(TableName.AgentSession),
          db.ref("lastUsedAt").withSchema(TableName.AgentSession),
          db.ref("revokedAt").withSchema(TableName.AgentSession),
          db.ref("name").withSchema(TableName.Identity).as("agentName"),
          db.ref("isAgent").withSchema(TableName.Identity).as("isAgent"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName")
        )
        .orderByRaw(`coalesce("${TableName.AgentSession}"."lastUsedAt", "${TableName.AgentSession}"."createdAt") desc`)
        .limit(limit);
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.AgentSession}: FindByProjectId` });
    }
  };

  return { ...orm, findOrgUsersByEmail, findByProjectId };
};
