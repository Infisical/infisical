import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretImports } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretImportDALFactory = ReturnType<typeof secretImportDALFactory>;

export const secretImportDALFactory = (db: TDbClient) => {
  const secretImportOrm = ormify(db, TableName.SecretImport);

  // we are using postion based sorting as its a small list
  // this will return the last value of the position in a folder with secret imports
  const findLastImportPosition = async (folderId: string, tx?: Knex) => {
    const lastPos = await (tx || db)(TableName.SecretImport)
      .where({ folderId })
      .max("position", { as: "position" })
      .first();
    return lastPos?.position || 0;
  };

  const updateAllPosition = async (folderId: string, pos: number, targetPos: number, positionInc = 1, tx?: Knex) => {
    try {
      if (targetPos === -1) {
        // this means delete
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .andWhere("position", ">", pos)
          .decrement("position", positionInc);
        return;
      }

      if (targetPos > pos) {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", "<=", targetPos)
          .andWhere("position", ">", pos)
          .decrement("position", positionInc);
      } else {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", ">=", targetPos)
          .andWhere("position", "<", pos)
          .increment("position", positionInc);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Update position" });
    }
  };

  const find = async (
    {
      search,
      limit,
      offset,
      ...filter
    }: Partial<
      TSecretImports & {
        projectId: string;
        search?: string;
        limit?: number;
        offset?: number;
      }
    >,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.SecretImport)
        .where(filter)
        .where((bd) => {
          if (search) {
            void bd.whereILike("importPath", `%${search}%`);
          }
        })
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        )
        .orderBy("position", "asc");

      if (limit) {
        void query.limit(limit).offset(offset ?? 0);
      }

      const docs = await query;

      return docs.map(({ envId, slug, name, ...el }) => ({
        ...el,
        importEnv: { id: envId, slug, name }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports" });
    }
  };

  const getProjectImportCount = async (
    { search, ...filter }: Partial<TSecretImports & { projectId: string; search?: string }>,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretImport)
        .where(filter)
        .where("isReplication", false)
        .where((bd) => {
          if (search) {
            void bd.whereILike("importPath", `%${search}%`);
          }
        })
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .count();

      return Number(docs[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "get secret imports count" });
    }
  };

  const findByFolderIds = async (folderIds: string[], tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretImport)
        .whereIn("folderId", folderIds)
        .where("isReplication", false)
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        )
        .orderBy("position", "asc");
      return docs.map(({ envId, slug, name, ...el }) => ({
        ...el,
        importEnv: { id: envId, slug, name }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports" });
    }
  };

  return {
    ...secretImportOrm,
    find,
    findByFolderIds,
    findLastImportPosition,
    updateAllPosition,
    getProjectImportCount
  };
};
