import { TDbClient } from "@app/db";
import { TableName, TSamlGroupMappings, TSamlGroupMappingsInsert, TSamlGroupMappingsUpdate } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSamlGroupMappingDALFactory = ReturnType<typeof samlGroupMappingDALFactory>;

export const samlGroupMappingDALFactory = (db: TDbClient) => {
  const samlGroupMappingOrm = ormify(db, TableName.SamlGroupMapping);

  const findBySamlConfigId = async (samlConfigId: string) => {
    const docs = await db(TableName.SamlGroupMapping)
      .where({ samlConfigId })
      .leftJoin(TableName.Groups, `${TableName.SamlGroupMapping}.groupId`, `${TableName.Groups}.id`)
      .select(
        `${TableName.SamlGroupMapping}.*`,
        `${TableName.Groups}.name as groupName`,
        `${TableName.Groups}.slug as groupSlug`
      );
    
    return docs.map(doc => ({
      id: doc.id,
      samlConfigId: doc.samlConfigId,
      samlGroupName: doc.samlGroupName,
      groupId: doc.groupId,
      groupName: doc.groupName,
      groupSlug: doc.groupSlug,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  };

  const upsertMappings = async (samlConfigId: string, mappings: Array<{ samlGroupName: string; groupId: string | null }>) => {
    return db.transaction(async (tx) => {
      // Delete existing mappings for this SAML config
      await tx(TableName.SamlGroupMapping).where({ samlConfigId }).del();
      
      // Insert new mappings
      if (mappings.length > 0) {
        const insertData = mappings.map(mapping => ({
          samlConfigId,
          samlGroupName: mapping.samlGroupName,
          groupId: mapping.groupId
        }));
        
        await tx(TableName.SamlGroupMapping).insert(insertData);
      }
      
      return mappings;
    });
  };

  const findGroupsForSamlGroups = async (samlConfigId: string, samlGroupNames: string[]) => {
    if (samlGroupNames.length === 0) return [];
    
    const docs = await db(TableName.SamlGroupMapping)
      .where({ samlConfigId })
      .whereIn("samlGroupName", samlGroupNames)
      .whereNotNull("groupId")
      .join(TableName.Groups, `${TableName.SamlGroupMapping}.groupId`, `${TableName.Groups}.id`)
      .select(
        `${TableName.SamlGroupMapping}.samlGroupName`,
        `${TableName.Groups}.id as groupId`,
        `${TableName.Groups}.name as groupName`,
        `${TableName.Groups}.slug as groupSlug`,
        `${TableName.Groups}.role as groupRole`,
        `${TableName.Groups}.roleId as groupRoleId`
      );
    
    return docs;
  };

  return {
    ...samlGroupMappingOrm,
    findBySamlConfigId,
    upsertMappings,
    findGroupsForSamlGroups
  };
};