import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TSecretImports } from "@app/db/schemas";
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
      .max({ position: "position" })
      .first();
    return lastPos?.position || 0;
  };

  const updateAllPosition = async (folderId: string, pos: number, targetPos: number, tx?: Knex) => {
    try {
      if (targetPos === -1) {
        // this means delete
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .andWhere("position", ">", pos)
          .decrement("position", 1);
        return;
      }

      if (targetPos > pos) {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", "<=", targetPos)
          .andWhere("position", ">", pos)
          .decrement("position", 1);
      } else {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", ">=", targetPos)
          .andWhere("position", "<", pos)
          .increment("position", 1);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Update position" });
    }
  };

  const find = async (filter: Partial<TSecretImports>, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretImport)
        .where(filter)
        .join(
          TableName.Environment,
          `${TableName.SecretImport}.importEnv`,
          `${TableName.Environment}.id`
        )
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
    findLastImportPosition,
    updateAllPosition
  };
};
