import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
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
    const existing = await getFirstAsset(orgId, assetType);
    if (existing) {
      return organizationAssetOrm.updateById(existing.id, { data, contentType, size });
    }
    return organizationAssetOrm.create({ orgId, assetType, data, contentType, size });
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
