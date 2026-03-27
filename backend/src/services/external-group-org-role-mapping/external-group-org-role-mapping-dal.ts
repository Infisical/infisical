import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
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
      for (const { id, ...mappingData } of mappingsToUpdate) {
        const updatedMapping = await externalGroupOrgRoleMappingOrm.update({ id }, mappingData, tx);
        updatedMappings.push(updatedMapping[0]);
      }

      const insertedMappings = await externalGroupOrgRoleMappingOrm.insertMany(mappingsToInsert, tx);

      return [...updatedMappings, ...insertedMappings];
    });

    return mappings;
  };

  /**
   * Returns all ExternalGroupOrgRoleMappings for a given group name across an
   * entire org hierarchy (root org + all sub-orgs). Used by $syncNewMembersRoles
   * to fan out provisioning: one SCIM group event creates memberships in every
   * org that has a mapping for that group name.
   */
  const findMappingsForGroupInOrgHierarchy = async (
    rootOrgId: string,
    groupName: string
  ): Promise<TExternalGroupOrgRoleMappings[]> => {
    const rows = await db
      .replicaNode()(TableName.ExternalGroupOrgRoleMapping)
      .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.ExternalGroupOrgRoleMapping}.orgId`)
      .where(`${TableName.ExternalGroupOrgRoleMapping}.groupName`, groupName)
      .where((qb) => {
        void qb
          .where(`${TableName.Organization}.id`, rootOrgId)
          .orWhere(`${TableName.Organization}.rootOrgId`, rootOrgId);
      })
      .select<TExternalGroupOrgRoleMappings[]>(`${TableName.ExternalGroupOrgRoleMapping}.*`);

    return rows;
  };

  /**
   * Renames all ExternalGroupOrgRoleMappings for a group across the hierarchy.
   * Called when a SCIM group is renamed so sub-org mappings don't become
   * orphaned (they'd reference the old name and never match again).
   */
  const updateGroupNameForOrgHierarchy = async (
    rootOrgId: string,
    oldGroupName: string,
    newGroupName: string,
    tx?: Knex
  ): Promise<void> => {
    await (tx || db)(TableName.ExternalGroupOrgRoleMapping)
      .whereIn(
        "orgId",
        (tx || db)(TableName.Organization)
          .where((qb) => {
            void qb.where("id", rootOrgId).orWhere("rootOrgId", rootOrgId);
          })
          .select("id")
      )
      .where("groupName", oldGroupName)
      .update({ groupName: newGroupName });
  };

  /**
   * Deletes all ExternalGroupOrgRoleMappings for a group across the hierarchy.
   * Called when a SCIM group is deleted so sub-org mappings don't persist as
   * ghost entries that would re-provision users if a new group with the same
   * name is created later.
   */
  const deleteGroupMappingsForOrgHierarchy = async (
    rootOrgId: string,
    groupName: string,
    tx?: Knex
  ): Promise<void> => {
    await (tx || db)(TableName.ExternalGroupOrgRoleMapping)
      .whereIn(
        "orgId",
        (tx || db)(TableName.Organization)
          .where((qb) => {
            void qb.where("id", rootOrgId).orWhere("rootOrgId", rootOrgId);
          })
          .select("id")
      )
      .where("groupName", groupName)
      .delete();
  };

  return {
    ...externalGroupOrgRoleMappingOrm,
    updateExternalGroupOrgRoleMappingForOrg,
    findMappingsForGroupInOrgHierarchy,
    updateGroupNameForOrgHierarchy,
    deleteGroupMappingsForOrgHierarchy
  };
};
