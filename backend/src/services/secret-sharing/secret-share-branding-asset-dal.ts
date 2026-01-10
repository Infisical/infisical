import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretShareBrandingAssetDALFactory = ReturnType<typeof secretShareBrandingAssetDALFactory>;

export const secretShareBrandingAssetDALFactory = (db: TDbClient) => {
  const brandingAssetOrm = ormify(db, TableName.SecretShareBrandingAsset);

  const findByOrgIdAndType = async (orgId: string, assetType: string) => {
    const asset = await db.replicaNode()(TableName.SecretShareBrandingAsset).where({ orgId, assetType }).first();
    return asset;
  };

  const upsert = async (orgId: string, assetType: string, data: Buffer, contentType: string, size: number) => {
    const existing = await findByOrgIdAndType(orgId, assetType);
    if (existing) {
      return brandingAssetOrm.updateById(existing.id, { data, contentType, size });
    }
    return brandingAssetOrm.create({ orgId, assetType, data, contentType, size });
  };

  const deleteByOrgIdAndType = async (orgId: string, assetType: string) => {
    await db(TableName.SecretShareBrandingAsset).where({ orgId, assetType }).delete();
  };

  const findAllByOrgId = async (orgId: string) => {
    return db.replicaNode()(TableName.SecretShareBrandingAsset).where({ orgId });
  };

  return {
    ...brandingAssetOrm,
    findByOrgIdAndType,
    upsert,
    deleteByOrgIdAndType,
    findAllByOrgId
  };
};
