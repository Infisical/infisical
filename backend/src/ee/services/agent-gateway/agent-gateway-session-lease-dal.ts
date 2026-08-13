import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentGatewaySessionLeaseDALFactory = ReturnType<typeof agentGatewaySessionLeaseDALFactory>;

export const agentGatewaySessionLeaseDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGatewaySessionLease);

  // Joined to the lease so a resolve can reuse an unexpired lease rather than minting a fresh one on every
  // poll. Without that, a 60-second poll churns a new database user every minute per session.
  const findBySessionId = async (sessionId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGatewaySessionLease)
      .where(`${TableName.AgentGatewaySessionLease}.sessionId`, sessionId)
      .join(
        TableName.DynamicSecretLease,
        `${TableName.DynamicSecretLease}.id`,
        `${TableName.AgentGatewaySessionLease}.dynamicSecretLeaseId`
      )
      .select(selectAllTableCols(TableName.AgentGatewaySessionLease))
      .select(
        db.ref("externalEntityId").withSchema(TableName.DynamicSecretLease),
        // Needed to enqueue the platform revocation job, which is keyed by (leaseId, dynamicSecretId).
        db.ref("dynamicSecretId").withSchema(TableName.DynamicSecretLease)
      );

  return {
    ...orm,
    findBySessionId
  };
};
