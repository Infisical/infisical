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

  return { ...orm, findOrgUsersByEmail };
};
