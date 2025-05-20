import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TCertificateDALFactory = ReturnType<typeof certificateDALFactory>;

export const certificateDALFactory = (db: TDbClient) => {
  const certificateOrm = ormify(db, TableName.Certificate);

  const countCertificatesInProject = async ({
    projectId,
    friendlyName,
    commonName
  }: {
    projectId: string;
    friendlyName?: string;
    commonName?: string;
  }) => {
    try {
      interface CountResult {
        count: string;
      }

      let query = db
        .replicaNode()(TableName.Certificate)
        .join(TableName.CertificateAuthority, `${TableName.Certificate}.caId`, `${TableName.CertificateAuthority}.id`)
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.id`, projectId);

      if (friendlyName) {
        query = query.andWhere(`${TableName.Certificate}.friendlyName`, friendlyName);
      }

      if (commonName) {
        query = query.andWhere(`${TableName.Certificate}.commonName`, commonName);
      }

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all project certificates" });
    }
  };

  const countCertificatesForPkiSubscriber = async (subscriberId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const query = db
        .replicaNode()(TableName.Certificate)
        .where(`${TableName.Certificate}.pkiSubscriberId`, subscriberId);

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all subscriber certificates" });
    }
  };

  return {
    ...certificateOrm,
    countCertificatesInProject,
    countCertificatesForPkiSubscriber
  };
};
