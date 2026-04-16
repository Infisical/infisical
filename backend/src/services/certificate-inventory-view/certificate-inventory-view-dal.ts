import { TDbClient } from "@app/db";
import { TableName, TCertificateInventoryViews } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TCertificateInventoryViewDALFactory = ReturnType<typeof certificateInventoryViewDALFactory>;

export const certificateInventoryViewDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CertificateInventoryView);

  const findByProjectId = async (projectId: string, userId?: string): Promise<TCertificateInventoryViews[]> => {
    try {
      const query = db
        .replicaNode()(TableName.CertificateInventoryView)
        .where({ projectId })
        .andWhere((qb) => {
          void qb.where({ isShared: true });
          if (userId) {
            void qb.orWhere((inner) => {
              void inner.where({ createdByUserId: userId, isShared: false });
            });
          }
        })
        .orderBy("name", "asc");

      return (await query) as TCertificateInventoryViews[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate inventory views by project" });
    }
  };

  return { ...orm, findByProjectId };
};
