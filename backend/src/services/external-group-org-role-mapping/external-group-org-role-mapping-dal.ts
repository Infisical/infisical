import { Tables } from "knex/types/tables";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TExternalGroupOrgRoleMappings } from "@app/db/schemas/external-group-org-role-mappings";
import { ormify } from "@app/lib/knex";

export type TExternalGroupOrgRoleMappingDALFactory = ReturnType<typeof externalGroupOrgRoleMappingDALFactory>;

export const externalGroupOrgRoleMappingDALFactory = (db: TDbClient) => {
  const externalGroupOrgRoleMappingOrm = ormify(db, TableName.ExternalGroupOrgRoleMapping);

  const updateExternalGroupOrgRoleMappingForOrg = async (
    orgId: string,
    newMappings: readonly Tables[TableName.ExternalGroupOrgRoleMapping]["insert"][]
  ) => {
    const currentMappings = await externalGroupOrgRoleMappingOrm.find({ orgId });

    const newMap = new Map(newMappings.map((mapping) => [mapping.groupName, mapping]));
    const currentMap = new Map(currentMappings.map((mapping) => [mapping.groupName, mapping]));

    const mappingsToDelete = currentMappings.filter((mapping) => !newMap.has(mapping.groupName));
    const mappingsToUpdate = currentMappings
      .filter((mapping) => newMap.has(mapping.groupName))
      .map((mapping) => ({ id: mapping.id, ...newMap.get(mapping.groupName) }));
    const mappingsToInsert = newMappings.filter((mapping) => !currentMap.has(mapping.groupName));

    const mappings = await externalGroupOrgRoleMappingOrm.transaction(async (tx) => {
      await externalGroupOrgRoleMappingOrm.delete({ $in: { id: mappingsToDelete.map((mapping) => mapping.id) } }, tx);

      const updatedMappings: TExternalGroupOrgRoleMappings[] = [];
      for await (const { id, ...mappingData } of mappingsToUpdate) {
        const updatedMapping = await externalGroupOrgRoleMappingOrm.update({ id }, mappingData, tx);
        updatedMappings.push(updatedMapping[0]);
      }

      const insertedMappings = await externalGroupOrgRoleMappingOrm.insertMany(mappingsToInsert, tx);

      return [...updatedMappings, ...insertedMappings];
    });

    return mappings;
  };

  return { ...externalGroupOrgRoleMappingOrm, updateExternalGroupOrgRoleMappingForOrg };
};
