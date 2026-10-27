import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceType,
  TableName,
  TAgentVaultPersonalValueReferences,
  TAgentVaultPersonalValues
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TAgentVaultOwner, whereOwner } from "../agent-vault/agent-vault-owner-fns";

export type TAgentVaultPersonalValueDALFactory = ReturnType<typeof agentVaultPersonalValueDALFactory>;
export type TAgentVaultPersonalValueReferenceDALFactory = ReturnType<typeof agentVaultPersonalValueReferenceDALFactory>;

export type TAgentVaultPersonalValueServiceRow = {
  serviceId: string;
  serviceName: string;
  hostPattern: string;
  credentialType: string;
  memberProvidedFields: string[];
  accessBundleId: string;
  accessBundleName: string;
};

export type TAgentVaultPersonalValueSummaryRow = Pick<
  TAgentVaultPersonalValues,
  "id" | "serviceId" | "field" | "updatedAt"
>;

export type TAgentVaultPersonalValueReferenceWithKey = TAgentVaultPersonalValueReferences & { key: string };

const table = TableName.AgentVaultPersonalValue;

export const agentVaultPersonalValueDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultPersonalValue);

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
  ): Promise<TAgentVaultPersonalValueServiceRow[]> => {
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
        ])) as TAgentVaultPersonalValueServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services needing personal values" });
    }
  };

  // Reads the primary even without a tx, so a value saved a moment ago shows as set.
  const findForOwner = async (
    { serviceIds, owner }: { serviceIds: string[]; owner: TAgentVaultOwner },
    tx?: Knex
  ): Promise<TAgentVaultPersonalValueSummaryRow[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await whereOwner((tx || db)(table).whereIn(`${table}.serviceId`, serviceIds), table, owner).select(
        `${table}.id`,
        `${table}.serviceId`,
        `${table}.field`,
        `${table}.updatedAt`
      )) as TAgentVaultPersonalValueSummaryRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault personal values" });
    }
  };

  const lockForOwnerAndService = async (
    { serviceId, owner }: { serviceId: string; owner: TAgentVaultOwner },
    tx: Knex
  ): Promise<TAgentVaultPersonalValues[]> => {
    try {
      return (await whereOwner(tx(table).where(`${table}.serviceId`, serviceId), table, owner)
        .orderBy(`${table}.id`)
        .forUpdate()
        .select(`${table}.*`)) as TAgentVaultPersonalValues[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault personal values" });
    }
  };

  // The hot path, on a replica. A value saved within the replica's lag reads as not set for one poll.
  const findForResolve = async ({
    serviceIds,
    owner
  }: {
    serviceIds: string[];
    owner: TAgentVaultOwner;
  }): Promise<Pick<TAgentVaultPersonalValues, "serviceId" | "field" | "encryptedValue">[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await whereOwner(db.replicaNode()(table).whereIn(`${table}.serviceId`, serviceIds), table, owner).select(
        `${table}.serviceId`,
        `${table}.field`,
        `${table}.encryptedValue`
      )) as Pick<TAgentVaultPersonalValues, "serviceId" | "field" | "encryptedValue">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault personal values for resolve" });
    }
  };

  /**
   * Clears what these actors saved for the services of `accessBundleId` (or of every bundle in the project) where
   * they no longer hold a grant, directly or through any group they are in, so being granted the bundle again
   * starts from nothing. An admin reaches every bundle without a grant, so only the actors a revoke named are
   * considered, and one who is still a project admin, directly or through a group, keeps everything. Call it after
   * the revoke, removal or demotion has been written in `tx`, so the admin check sees the new roles.
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
        .whereNotExists((admin) => {
          void admin
            .from(TableName.Membership)
            .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .where(`${TableName.Membership}.scopeProjectId`, projectId)
            .where(`${TableName.Membership}.isActive`, true)
            .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
            .where((live) => {
              void live
                .where(`${TableName.MembershipRole}.isTemporary`, false)
                .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", tx.fn.now());
            })
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
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault personal values without a grant" });
    }
  };

  /**
   * The owner's grants on the bundle, direct or through a group they are in, taken FOR SHARE. A revoke deletes these
   * rows in its own transaction, so this waits for one in flight and then sees the rows gone.
   */
  const lockGrantsForOwner = async (
    { projectId, accessBundleId, owner }: { projectId: string; accessBundleId: string; owner: TAgentVaultOwner },
    tx: Knex
  ): Promise<{ id: string }[]> => {
    try {
      return (await tx(TableName.Membership)
        .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.scopeResourceType`, ResourceType.AgentVaultAccessBundle)
        .where(`${TableName.Membership}.scopeResourceId`, accessBundleId)
        .where((holder) => {
          void holder
            .where(
              owner.userId ? `${TableName.Membership}.actorUserId` : `${TableName.Membership}.actorIdentityId`,
              (owner.userId ?? owner.identityId) as string
            )
            .orWhereIn(`${TableName.Membership}.actorGroupId`, function ownerGroups() {
              if (owner.userId) {
                void this.select("groupId").from(TableName.UserGroupMembership).where({ userId: owner.userId });
              } else {
                void this.select("groupId")
                  .from(TableName.IdentityGroupMembership)
                  .where({ identityId: owner.identityId as string });
              }
            });
        })
        .forShare()
        .select(`${TableName.Membership}.id`)) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault access bundle grants for owner" });
    }
  };

  /**
   * The owner's live project admin roles, direct or through a group they are in, taken FOR SHARE with their membership
   * rows. A demotion or a removal deletes these rows in its own transaction, so this waits for one in flight and then
   * sees the rows gone.
   */
  const lockAdminRolesForOwner = async (
    { projectId, owner }: { projectId: string; owner: TAgentVaultOwner },
    tx: Knex
  ): Promise<{ id: string }[]> => {
    try {
      return (await tx(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.isActive`, true)
        .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
        .where((live) => {
          void live
            .where(`${TableName.MembershipRole}.isTemporary`, false)
            .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", tx.fn.now());
        })
        .where((holder) => {
          void holder
            .where(
              owner.userId ? `${TableName.Membership}.actorUserId` : `${TableName.Membership}.actorIdentityId`,
              (owner.userId ?? owner.identityId) as string
            )
            .orWhereIn(`${TableName.Membership}.actorGroupId`, function ownerGroups() {
              if (owner.userId) {
                void this.select("groupId").from(TableName.UserGroupMembership).where({ userId: owner.userId });
              } else {
                void this.select("groupId")
                  .from(TableName.IdentityGroupMembership)
                  .where({ identityId: owner.identityId as string });
              }
            });
        })
        .forShare()
        .select(`${TableName.MembershipRole}.id`)) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault admin roles for owner" });
    }
  };

  // Every member's values for the service, except those for the fields still left to members.
  const deleteForServiceExceptFields = async (
    { serviceId, keepFields }: { serviceId: string; keepFields: string[] },
    tx: Knex
  ) => {
    try {
      return await tx(table).where(`${table}.serviceId`, serviceId).whereNotIn(`${table}.field`, keepFields).delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete agent vault personal values for fields no longer member-provided"
      });
    }
  };

  return {
    ...orm,
    deleteForServiceExceptFields,
    findServicesNeedingValues,
    findForOwner,
    lockForOwnerAndService,
    findForResolve,
    deleteForActorsWithoutGrant,
    lockGrantsForOwner,
    lockAdminRolesForOwner
  };
};

export const agentVaultPersonalValueReferenceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultPersonalValueReference);

  // The key comes from the variable, so a rename shows through without touching these rows. Reads the primary even
  // without a tx, so a value saved a moment ago lists the keys it uses.
  const findByPersonalValueIds = async (
    personalValueIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultPersonalValueReferenceWithKey[]> => {
    if (!personalValueIds.length) return [];
    try {
      return (await (tx || db)(TableName.AgentVaultPersonalValueReference)
        .join(
          TableName.AgentVaultVariable,
          `${TableName.AgentVaultPersonalValueReference}.variableId`,
          `${TableName.AgentVaultVariable}.id`
        )
        .whereIn(`${TableName.AgentVaultPersonalValueReference}.personalValueId`, personalValueIds)
        .orderBy(`${TableName.AgentVaultVariable}.key`, "asc")
        .select(
          `${TableName.AgentVaultPersonalValueReference}.*`,
          db.ref("key").withSchema(TableName.AgentVaultVariable)
        )) as TAgentVaultPersonalValueReferenceWithKey[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault personal value references" });
    }
  };

  return { ...orm, findByPersonalValueIds };
};
