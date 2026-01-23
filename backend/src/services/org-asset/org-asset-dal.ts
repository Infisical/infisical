import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TOrgAssetDALFactory = ReturnType<typeof orgAssetDALFactory>;

export const orgAssetDALFactory = (db: TDbClient) => {
  const organizationAssetOrm = ormify(db, TableName.OrganizationAsset);

  // "First Asset" functions useful in scenarios where only one asset of a type is expected per organization
  const getFirstAsset = async (orgId: string, assetType: string) => {
    const asset = await db.replicaNode()(TableName.OrganizationAsset).where({ orgId, assetType }).first();
    return asset;
  };

  const upsertFirstAsset = async (
    orgId: string,
    assetType: string,
    data: Buffer,
    contentType: string,
    size: number
  ) => {
    return db.transaction(async (tx) => {
      const existing = await tx(TableName.OrganizationAsset).where({ orgId, assetType }).first();
      if (existing) {
        const [updated] = await tx(TableName.OrganizationAsset)
          .where({ id: existing.id })
          .update({ data, contentType, size })
          .returning("*");
        return updated;
      }
      const [created] = await tx(TableName.OrganizationAsset)
        .insert({ orgId, assetType, data, contentType, size })
        .returning("*");
      return created;
    });
  };

  const deleteAssetsByType = async (orgId: string, assetType: string) => {
    await db(TableName.OrganizationAsset).where({ orgId, assetType }).delete();
  };

  const listAssets = async (orgId: string) => {
    return db.replicaNode()(TableName.OrganizationAsset).where({ orgId });
  };

  const listAssetsByType = async (orgId: string, assetTypes: string[]) => {
    return db.replicaNode()(TableName.OrganizationAsset).where({ orgId }).whereIn("assetType", assetTypes);
  };

  return {
    ...organizationAssetOrm,
    getFirstAsset,
    upsertFirstAsset,
    deleteAssetsByType,
    listAssets,
    listAssetsByType
  };
};
