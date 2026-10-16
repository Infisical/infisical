import { Tables } from "knex/types/tables";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TExternalGroupOrgRoleMappings } from "@app/db/schemas/external-group-org-role-mappings";
import { PgSqlLock } from "@app/keystore/keystore";
import { ConflictError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

type TMappingRole = Pick<TExternalGroupOrgRoleMappings, "groupName" | "role" | "roleId">;

const toMappingSetKey = (mappings: readonly TMappingRole[]) =>
  mappings
    .map(({ groupName, role, roleId }) => JSON.stringify([groupName, role, roleId ?? null]))
    .sort()
    .join(",");

export type TExternalGroupOrgRoleMappingDALFactory = ReturnType<typeof externalGroupOrgRoleMappingDALFactory>;

export const externalGroupOrgRoleMappingDALFactory = (db: TDbClient) => {
  const externalGroupOrgRoleMappingOrm = ormify(db, TableName.ExternalGroupOrgRoleMapping);

  // The caller authorizes the change against `expectedMappings`, so the write must land on exactly
  // that set: a concurrent save in between would otherwise be overwritten (or restored) unchecked.
  const updateExternalGroupOrgRoleMappingForOrg = async (
    orgId: string,
    newMappings: readonly Tables[TableName.ExternalGroupOrgRoleMapping]["insert"][],
    expectedMappings: readonly TMappingRole[]
  ) => {
    const mappings = await externalGroupOrgRoleMappingOrm.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ExternalGroupOrgRoleMappingUpdate(orgId)]);

      const currentMappings = await externalGroupOrgRoleMappingOrm.find({ orgId }, { tx });
      if (toMappingSetKey(currentMappings) !== toMappingSetKey(expectedMappings))
        throw new ConflictError({
          message:
            "The group to organization role mappings were changed by another user while you were saving. Reload the mappings and try again."
        });

      const newMap = new Map(newMappings.map((mapping) => [mapping.groupName, mapping]));
      const currentMap = new Map(currentMappings.map((mapping) => [mapping.groupName, mapping]));

      const mappingsToDelete = currentMappings.filter((mapping) => !newMap.has(mapping.groupName));
      const mappingsToUpdate = currentMappings
        .filter((mapping) => newMap.has(mapping.groupName))
        .map((mapping) => ({ id: mapping.id, ...newMap.get(mapping.groupName) }));
      const mappingsToInsert = newMappings.filter((mapping) => !currentMap.has(mapping.groupName));

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

  const primaryNode = () => db.primaryNode();

  return { ...externalGroupOrgRoleMappingOrm, updateExternalGroupOrgRoleMappingForOrg, primaryNode };
};
