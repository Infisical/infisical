import { TDbClient } from "@app/db";
import { TableName, TCertificateAuthorityCrl } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, TOrmify } from "@app/lib/knex";

export type TCertificateAuthorityCrlDALFactory = TOrmify<TableName.CertificateAuthorityCrl> & {
  updateEncryptedCrlAndBumpUpdatedAt: (
    filter: { caId: string },
    data: { encryptedCrl: Buffer }
  ) => Promise<TCertificateAuthorityCrl[]>;
};

export const certificateAuthorityCrlDALFactory = (db: TDbClient): TCertificateAuthorityCrlDALFactory => {
  const caCrlOrm = ormify(db, TableName.CertificateAuthorityCrl);

  const updateEncryptedCrlAndBumpUpdatedAt = async (
    filter: { caId: string },
    data: { encryptedCrl: Buffer }
  ): Promise<TCertificateAuthorityCrl[]> => {
    try {
      const res = await db(TableName.CertificateAuthorityCrl)
        .where(filter)
        .update({ ...data, updatedAt: new Date() } as never)
        .returning("*");
      return res as TCertificateAuthorityCrl[];
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateEncryptedCrlAndBumpUpdatedAt" });
    }
  };

  return {
    ...caCrlOrm,
    updateEncryptedCrlAndBumpUpdatedAt
  };
};
