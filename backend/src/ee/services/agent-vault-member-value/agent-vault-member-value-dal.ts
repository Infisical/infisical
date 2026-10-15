import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  RESOURCE_SCOPE,
  ResourceType,
  TableName,
  TAgentVaultMemberValueReferences,
  TAgentVaultMemberValues
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TAgentVaultOwner, whereOwner } from "../agent-vault/agent-vault-owner-fns";

export type TAgentVaultMemberValueDALFactory = ReturnType<typeof agentVaultMemberValueDALFactory>;
export type TAgentVaultMemberValueReferenceDALFactory = ReturnType<typeof agentVaultMemberValueReferenceDALFactory>;

export type TAgentVaultMemberValueServiceRow = {
  serviceId: string;
  serviceName: string;
  hostPattern: string;
  credentialType: string;
  memberProvidedFields: string[];
  accessBundleId: string;
  accessBundleName: string;
};

export type TAgentVaultMemberValueSummaryRow = Pick<
  TAgentVaultMemberValues,
  "id" | "serviceId" | "field" | "updatedAt"
>;

export type TAgentVaultMemberValueReferenceWithKey = TAgentVaultMemberValueReferences & { key: string };

const table = TableName.AgentVaultMemberValue;

export const agentVaultMemberValueDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultMemberValue);

  /**
   * Every service in these bundles that leaves a field to each member. `null` bundle ids means every bundle in the
   * project. Reads the primary even without a tx, so a service changed a moment ago is listed as it is now.
   */
  const findServicesNeedingValues = async (
    {
      projectId,
      accessBundleIds,
      serviceId
    }: { projectId: string; accessBundleIds: string[] | null; serviceId?: string },
    tx?: Knex
  ): Promise<TAgentVaultMemberValueServiceRow[]> => {
    if (accessBundleIds?.length === 0) return [];
    try {
      const query = (tx || db)(TableName.AgentVaultService)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .whereNotNull(`${TableName.AgentVaultService}.memberProvidedFields`);

      if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
      if (serviceId) void query.where(`${TableName.AgentVaultService}.id`, serviceId);

      return (await query
        .select(
          db.ref("id").withSchema(TableName.AgentVaultService).as("serviceId"),
          db.ref("name").withSchema(TableName.AgentVaultService).as("serviceName"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.ref("credentialType").withSchema(TableName.AgentVaultService),
          db.ref("memberProvidedFields").withSchema(TableName.AgentVaultService),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )
        .orderBy([
          { column: "accessBundleName", order: "asc" },
          { column: "serviceName", order: "asc" }
        ])) as TAgentVaultMemberValueServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services needing member values" });
    }
  };

  // Reads the primary even without a tx, so a value saved a moment ago shows as set.
  const findForOwner = async (
    { serviceIds, owner }: { serviceIds: string[]; owner: TAgentVaultOwner },
    tx?: Knex
  ): Promise<TAgentVaultMemberValueSummaryRow[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await whereOwner((tx || db)(table).whereIn(`${table}.serviceId`, serviceIds), table, owner).select(
        `${table}.id`,
        `${table}.serviceId`,
        `${table}.field`,
        `${table}.updatedAt`
      )) as TAgentVaultMemberValueSummaryRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault member values" });
    }
  };

  const lockForOwnerAndService = async (
    { serviceId, owner }: { serviceId: string; owner: TAgentVaultOwner },
    tx: Knex
  ): Promise<TAgentVaultMemberValues[]> => {
    try {
      return (await whereOwner(tx(table).where(`${table}.serviceId`, serviceId), table, owner)
        .orderBy(`${table}.id`)
        .forUpdate()
        .select(`${table}.*`)) as TAgentVaultMemberValues[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault member values" });
    }
  };

  // The hot path, on a replica. A value saved within the replica's lag reads as not set for one poll.
  const findForResolve = async ({
    serviceIds,
    owner
  }: {
    serviceIds: string[];
    owner: TAgentVaultOwner;
  }): Promise<Pick<TAgentVaultMemberValues, "serviceId" | "field" | "encryptedValue">[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await whereOwner(db.replicaNode()(table).whereIn(`${table}.serviceId`, serviceIds), table, owner).select(
        `${table}.serviceId`,
        `${table}.field`,
        `${table}.encryptedValue`
      )) as Pick<TAgentVaultMemberValues, "serviceId" | "field" | "encryptedValue">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault member values for resolve" });
    }
  };

  /**
   * Clears what these actors saved for the services of `accessBundleId` (or of every bundle in the project) where
   * they no longer hold a grant, directly or through any group they are in, so being granted the bundle again
   * starts from nothing. An admin reaches every bundle without a grant, so only the actors a revoke named are
   * considered: everyone else's values are left alone.
   */
  const deleteForActorsWithoutGrant = async (
    {
      projectId,
      accessBundleId,
      userIds,
      identityIds
    }: { projectId: string; accessBundleId?: string; userIds: string[]; identityIds: string[] },
    tx: Knex
  ) => {
    if (!userIds.length && !identityIds.length) return 0;
    try {
      const services = tx(TableName.AgentVaultService)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .whereRaw(`??.?? = ??.??`, [TableName.AgentVaultService, "id", table, "serviceId"])
        .whereNotExists((grant) => {
          void grant
            .from(TableName.Membership)
            .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
            .where(`${TableName.Membership}.scopeProjectId`, projectId)
            .where(`${TableName.Membership}.scopeResourceType`, ResourceType.AgentVaultAccessBundle)
            .whereRaw(`??.?? = ??.??::text`, [
              TableName.Membership,
              "scopeResourceId",
              TableName.AgentVaultAccessBundle,
              "id"
            ])
            .where((holder) => {
              void holder
                .whereRaw(`??.?? = ??.??`, [TableName.Membership, "actorUserId", table, "userId"])
                .orWhereRaw(`??.?? = ??.??`, [TableName.Membership, "actorIdentityId", table, "identityId"])
                .orWhereIn(
                  `${TableName.Membership}.actorGroupId`,
                  tx(TableName.UserGroupMembership)
                    .whereRaw(`??.?? = ??.??`, [TableName.UserGroupMembership, "userId", table, "userId"])
                    .select("groupId")
                )
                .orWhereIn(
                  `${TableName.Membership}.actorGroupId`,
                  tx(TableName.IdentityGroupMembership)
                    .whereRaw(`??.?? = ??.??`, [TableName.IdentityGroupMembership, "identityId", table, "identityId"])
                    .select("groupId")
                );
            })
            .select(tx.raw("1"));
        })
        .select(tx.raw("1"));
      if (accessBundleId) void services.where(`${TableName.AgentVaultAccessBundle}.id`, accessBundleId);

      return await tx(table)
        .where((actor) => {
          if (userIds.length) void actor.whereIn(`${table}.userId`, userIds);
          if (identityIds.length) void actor.orWhereIn(`${table}.identityId`, identityIds);
        })
        .whereExists(services)
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault member values without a grant" });
    }
  };

  return {
    ...orm,
    findServicesNeedingValues,
    findForOwner,
    lockForOwnerAndService,
    findForResolve,
    deleteForActorsWithoutGrant
  };
};

export const agentVaultMemberValueReferenceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultMemberValueReference);

  // The key comes from the variable, so a rename shows through without touching these rows. Reads the primary even
  // without a tx, so a value saved a moment ago lists the keys it uses.
  const findByMemberValueIds = async (
    memberValueIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultMemberValueReferenceWithKey[]> => {
    if (!memberValueIds.length) return [];
    try {
      return (await (tx || db)(TableName.AgentVaultMemberValueReference)
        .join(
          TableName.AgentVaultVariable,
          `${TableName.AgentVaultMemberValueReference}.variableId`,
          `${TableName.AgentVaultVariable}.id`
        )
        .whereIn(`${TableName.AgentVaultMemberValueReference}.memberValueId`, memberValueIds)
        .orderBy(`${TableName.AgentVaultVariable}.key`, "asc")
        .select(
          `${TableName.AgentVaultMemberValueReference}.*`,
          db.ref("key").withSchema(TableName.AgentVaultVariable)
        )) as TAgentVaultMemberValueReferenceWithKey[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault member value references" });
    }
  };

  return { ...orm, findByMemberValueIds };
};
