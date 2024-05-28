import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretSharingDALFactory = ReturnType<typeof secretSharingDALFactory>;

export const secretSharingDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.SecretSharing);

  return {
    create: sharedSecretOrm.create,
    find: sharedSecretOrm.find,
    findById: sharedSecretOrm.findById,
    deleteById: sharedSecretOrm.deleteById
  };
};
