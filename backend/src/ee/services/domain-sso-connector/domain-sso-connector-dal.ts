import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TDomainSsoConnectorDALFactory = ReturnType<typeof domainSsoConnectorDALFactory>;

export const domainSsoConnectorDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DomainSsoConnector);

  const findByDomain = async (domain: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.DomainSsoConnector).where({ domain }).first();
    return result || null;
  };

  const findByOrgId = async (orgId: string, tx?: Knex) => {
    const results = await (tx || db.replicaNode())(TableName.DomainSsoConnector).where({ ownerOrgId: orgId });
    return results;
  };

  return {
    ...orm,
    findByDomain,
    findByOrgId
  };
};
