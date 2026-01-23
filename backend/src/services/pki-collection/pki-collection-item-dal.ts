import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TPkiCollectionItems } from "@app/db/schemas/pki-collection-items";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { PkiItemType } from "./pki-collection-types";

export type TPkiCollectionItemDALFactory = ReturnType<typeof pkiCollectionItemDALFactory>;

export const pkiCollectionItemDALFactory = (db: TDbClient) => {
  const pkiCollectionItemOrm = ormify(db, TableName.PkiCollectionItem);

  const findPkiCollectionItems = async ({
    collectionId,
    type,
    offset,
    limit
  }: {
    collectionId: string;
    type?: PkiItemType;
    offset?: number;
    limit?: number;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.PkiCollectionItem)
        .select(
          "pki_collection_items.*",
          db.raw(
            `COALESCE("${TableName.InternalCertificateAuthority}"."notBefore", "${TableName.Certificate}"."notBefore") as "notBefore"`
          ),
          db.raw(
            `COALESCE("${TableName.InternalCertificateAuthority}"."notAfter", "${TableName.Certificate}"."notAfter") as "notAfter"`
          ),
          db.raw(
            `COALESCE("${TableName.InternalCertificateAuthority}"."friendlyName", "${TableName.Certificate}"."friendlyName") as "friendlyName"`
          )
        )
        .leftJoin(
          TableName.CertificateAuthority,
          `${TableName.PkiCollectionItem}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .leftJoin(
          TableName.InternalCertificateAuthority,
          `${TableName.PkiCollectionItem}.caId`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .leftJoin(TableName.Certificate, `${TableName.PkiCollectionItem}.certId`, `${TableName.Certificate}.id`)
        .where((builder) => {
          void builder.where(`${TableName.PkiCollectionItem}.pkiCollectionId`, collectionId);
          if (type === PkiItemType.CA) {
            void builder.whereNull(`${TableName.PkiCollectionItem}.certId`);
          } else if (type === PkiItemType.CERTIFICATE) {
            void builder.whereNull(`${TableName.PkiCollectionItem}.caId`);
          }
        });

      if (offset) {
        void query.offset(offset);
      }
      if (limit) {
        void query.limit(limit);
      }

      void query.orderBy(`${TableName.PkiCollectionItem}.createdAt`, "desc");

      const result = await query;
      return result as (TPkiCollectionItems & { notAfter: Date; notBefore: Date; friendlyName: string })[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all PKI collection items" });
    }
  };

  const countItemsInPkiCollection = async (collectionId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const query = db
        .replicaNode()(TableName.PkiCollectionItem)
        .where(`${TableName.PkiCollectionItem}.pkiCollectionId`, collectionId);

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all PKI collection items" });
    }
  };

  return {
    ...pkiCollectionItemOrm,
    findPkiCollectionItems,
    countItemsInPkiCollection
  };
};
