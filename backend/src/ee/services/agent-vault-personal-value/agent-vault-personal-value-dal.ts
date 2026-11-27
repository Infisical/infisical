import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  TableName,
  TAgentVaultPersonalValueReferences,
  TAgentVaultPersonalValues,
  TAgentVaultServices
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import {
  addOauthRequiredScopes,
  compareAndSwapOauthTokens,
  TOauthTokenColumns
} from "../agent-vault-oauth/agent-vault-oauth-token-dal-fns";
import { AgentVaultVariableReferenceField } from "../agent-vault/agent-vault-enums";
import { TAgentVaultOwner, whereOwner } from "../agent-vault/agent-vault-owner-fns";

export type TAgentVaultPersonalValueDALFactory = ReturnType<typeof agentVaultPersonalValueDALFactory>;
export type TAgentVaultPersonalValueReferenceDALFactory = ReturnType<typeof agentVaultPersonalValueReferenceDALFactory>;

export type TAgentVaultPersonalValueServiceRow = {
  serviceId: string;
  serviceName: string;
  hostPattern: string | null;
  credentialType: string;
  memberProvidedFields: string[];
  // Null when the service was read on its own rather than through a bundle.
  accessBundleId: string | null;
  accessBundleName: string | null;
};

export type TAgentVaultPersonalValueSummaryRow = Pick<
  TAgentVaultPersonalValues,
  "id" | "serviceId" | "field" | "updatedAt" | "oauthConfig"
>;

// A member's OAuth tokens with where the service sends them, read on the primary for a refresh or a scope report.
export type TAgentVaultPersonalOauthRow = Pick<TAgentVaultPersonalValues, "id" | "encryptedValue" | "oauthConfig"> &
  Pick<TAgentVaultServices, "hostPattern" | "config">;

const OAUTH_TOKEN_COLUMNS: TOauthTokenColumns = {
  table: TableName.AgentVaultPersonalValue,
  secretColumn: "encryptedValue",
  configColumn: "oauthConfig"
};

export type TAgentVaultPersonalValueReferenceWithKey = TAgentVaultPersonalValueReferences & { key: string };

const table = TableName.AgentVaultPersonalValue;

export const agentVaultPersonalValueDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultPersonalValue);

  /**
   * Every service in these bundles that leaves a field to each member, once per bundle it is in. `null` bundle ids means
   * every bundle in the project, or with `serviceId`, that one service once, with no bundle. Reads the primary even
   * without a tx, so a service changed a moment ago is listed as it is now.
   */
  // directServiceIds are services the caller uses directly. One that none of accessBundleIds holds comes back once, with
  // no bundle, like a service no bundle holds.
  const findServicesNeedingValues = async (
    {
      projectId,
      accessBundleIds,
      serviceId,
      includeUnlinked,
      directServiceIds = []
    }: {
      projectId: string;
      accessBundleIds: string[] | null;
      serviceId?: string;
      includeUnlinked?: boolean;
      directServiceIds?: string[];
    },
    tx?: Knex
  ): Promise<TAgentVaultPersonalValueServiceRow[]> => {
    if (accessBundleIds?.length === 0 && !directServiceIds.length) return [];
    try {
      // One service on its own, whatever bundles it is in: what its personal values routes return.
      if (serviceId && !accessBundleIds) {
        return (await (tx || db)(TableName.AgentVaultService)
          .where({ id: serviceId, projectId })
          .whereNull("sessionId")
          .whereNotNull("memberProvidedFields")
          .select(
            db.ref("id").as("serviceId"),
            db.ref("name").as("serviceName"),
            "hostPattern",
            "credentialType",
            "memberProvidedFields",
            db.raw("NULL::uuid AS ??", ["accessBundleId"]),
            db.raw("NULL::text AS ??", ["accessBundleName"])
          )) as TAgentVaultPersonalValueServiceRow[];
      }
      // One row per bundle the service is in, since setup is reported per bundle.
      const query = (tx || db)(TableName.AgentVaultService)
        .join(
          TableName.AgentVaultAccessBundleService,
          `${TableName.AgentVaultAccessBundleService}.serviceId`,
          `${TableName.AgentVaultService}.id`
        )
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundleService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .whereNotNull(`${TableName.AgentVaultService}.memberProvidedFields`);

      if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
      if (serviceId) void query.where(`${TableName.AgentVaultService}.id`, serviceId);

      const linked = (await query
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
      const linkedIds = new Set(linked.map((row) => row.serviceId));
      const directOnly = directServiceIds.filter((id) => !linkedIds.has(id) && (!serviceId || id === serviceId));
      // Only a caller who reaches every service (an admin) sees one that no bundle holds yet, so they can set it up early.
      const withUnlinked = includeUnlinked && !accessBundleIds;
      if (!withUnlinked && !directOnly.length) return linked;
      const unlinked = (await (tx || db)(TableName.AgentVaultService)
        .where({ projectId })
        .whereNull("sessionId")
        .whereNotNull("memberProvidedFields")
        .where((qb) => {
          if (withUnlinked) {
            void qb.orWhereNotExists((sub) => {
              void sub
                .select(db.raw("1"))
                .from(TableName.AgentVaultAccessBundleService)
                .whereRaw("?? = ??", [
                  `${TableName.AgentVaultAccessBundleService}.serviceId`,
                  `${TableName.AgentVaultService}.id`
                ]);
            });
          }
          if (directOnly.length) void qb.orWhereIn("id", directOnly);
        })
        .modify((q) => {
          if (serviceId) void q.where({ id: serviceId });
        })
        .select(
          db.ref("id").as("serviceId"),
          db.ref("name").as("serviceName"),
          "hostPattern",
          "credentialType",
          "memberProvidedFields",
          db.raw("NULL::uuid AS ??", ["accessBundleId"]),
          db.raw("NULL::text AS ??", ["accessBundleName"])
        )
        .orderBy("name", "asc")) as TAgentVaultPersonalValueServiceRow[];
      return [...linked, ...unlinked];
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
        `${table}.updatedAt`,
        `${table}.oauthConfig`
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
  }): Promise<Pick<TAgentVaultPersonalValues, "serviceId" | "field" | "encryptedValue" | "oauthConfig">[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await whereOwner(db.replicaNode()(table).whereIn(`${table}.serviceId`, serviceIds), table, owner).select(
        `${table}.serviceId`,
        `${table}.field`,
        `${table}.encryptedValue`,
        `${table}.oauthConfig`
      )) as Pick<TAgentVaultPersonalValues, "serviceId" | "field" | "encryptedValue" | "oauthConfig">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault personal values for resolve" });
    }
  };

  // The owner's project memberships, direct or through a group, alive now. Each side is a value, a column of the
  // outer query, or null for an owner of the other kind.
  const ownerMemberships = (
    conn: Knex,
    projectId: string,
    { userId, identityId }: { userId: Knex.Raw | string | null; identityId: Knex.Raw | string | null }
  ) =>
    conn(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .where(`${TableName.Membership}.scopeProjectId`, projectId)
      .where(`${TableName.Membership}.isActive`, true)
      .where((holder) => {
        if (userId) {
          void holder
            .orWhere(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(
              `${TableName.Membership}.actorGroupId`,
              conn(TableName.UserGroupMembership)
                .where(`${TableName.UserGroupMembership}.userId`, userId)
                .select("groupId")
            );
        }
        if (identityId) {
          void holder
            .orWhere(`${TableName.Membership}.actorIdentityId`, identityId)
            .orWhereIn(
              `${TableName.Membership}.actorGroupId`,
              conn(TableName.IdentityGroupMembership)
                .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
                .select("groupId")
            );
        }
      });

  /**
   * Deletes what these actors saved in the project once they are no longer in it, directly or through a group. Losing a
   * role or a bundle keeps the values, since roles can't be evaluated here; resolve still sends a value only for a
   * service its owner can use.
   */
  const deleteForActorsOutsideProject = async (
    { projectId, userIds = [], identityIds = [] }: { projectId: string; userIds?: string[]; identityIds?: string[] },
    tx: Knex
  ) => {
    if (!userIds.length && !identityIds.length) return 0;
    try {
      return await tx(table)
        .where((actor) => {
          if (userIds.length) void actor.whereIn(`${table}.userId`, userIds);
          if (identityIds.length) void actor.orWhereIn(`${table}.identityId`, identityIds);
        })
        .whereExists(
          tx(TableName.AgentVaultService)
            .where(`${TableName.AgentVaultService}.projectId`, projectId)
            .whereRaw(`??.?? = ??.??`, [TableName.AgentVaultService, "id", table, "serviceId"])
            .select(tx.raw("1"))
        )
        .whereNotExists(
          ownerMemberships(tx, projectId, {
            userId: tx.ref(`${table}.userId`) as unknown as Knex.Raw,
            identityId: tx.ref(`${table}.identityId`) as unknown as Knex.Raw
          }).select(tx.raw("1"))
        )
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault personal values of actors outside the project" });
    }
  };

  /**
   * The owner's project memberships, direct or through a group, taken FOR SHARE. Leaving the project deletes these rows
   * in its own transaction before it deletes the owner's values, so a save waits for one in flight and then sees the
   * rows gone, and can never land after the cleanup.
   */
  const lockProjectMembershipsForOwner = async (
    { projectId, owner }: { projectId: string; owner: TAgentVaultOwner },
    tx: Knex
  ): Promise<{ id: string }[]> => {
    try {
      return (await ownerMemberships(tx, projectId, {
        userId: owner.userId ?? null,
        identityId: owner.userId ? null : (owner.identityId ?? null)
      })
        .forShare()
        .select(`${TableName.Membership}.id`)) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault project memberships for owner" });
    }
  };

  // The projects among `projectIds` where anyone saved a value, sorted like `findProjectIdsWithValues`.
  const findProjectIdsWithAnyValues = async (projectIds: string[], tx: Knex): Promise<string[]> => {
    if (!projectIds.length) return [];
    try {
      const rows = (await tx(table)
        .join(TableName.AgentVaultService, `${table}.serviceId`, `${TableName.AgentVaultService}.id`)
        .whereIn(`${TableName.AgentVaultService}.projectId`, projectIds)
        .distinct(`${TableName.AgentVaultService}.projectId`)) as { projectId: string }[];
      return rows.map((row) => row.projectId).sort();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault projects with any personal values" });
    }
  };

  // The projects among `projectIds` where any of these actors saved a value, sorted so callers that clear each one
  // take the per-project advisory locks in one order.
  const findProjectIdsWithValues = async (
    { projectIds, userIds, identityIds }: { projectIds: string[]; userIds: string[]; identityIds: string[] },
    tx: Knex
  ): Promise<string[]> => {
    if (!projectIds.length || (!userIds.length && !identityIds.length)) return [];
    try {
      const rows = (await tx(table)
        .join(TableName.AgentVaultService, `${table}.serviceId`, `${TableName.AgentVaultService}.id`)
        .whereIn(`${TableName.AgentVaultService}.projectId`, projectIds)
        .where((actor) => {
          if (userIds.length) void actor.whereIn(`${table}.userId`, userIds);
          if (identityIds.length) void actor.orWhereIn(`${table}.identityId`, identityIds);
        })
        .distinct(`${TableName.AgentVaultService}.projectId`)) as { projectId: string }[];
      return rows.map((row) => row.projectId).sort();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault projects with personal values" });
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

  // The primary, so a refresh never starts from tokens older than the last committed one.
  const findOauthForOwner = async (
    { serviceId, owner }: { serviceId: string; owner: TAgentVaultOwner },
    tx?: Knex
  ): Promise<TAgentVaultPersonalOauthRow | undefined> => {
    try {
      return (await whereOwner(
        (tx || db)(table)
          .join(TableName.AgentVaultService, `${TableName.AgentVaultService}.id`, `${table}.serviceId`)
          .where(`${table}.serviceId`, serviceId)
          .where(`${table}.field`, AgentVaultVariableReferenceField.CredentialValue)
          .whereNotNull(`${table}.oauthConfig`),
        table,
        owner
      ).first(
        `${table}.id`,
        `${table}.encryptedValue`,
        `${table}.oauthConfig`,
        db.ref("hostPattern").withSchema(TableName.AgentVaultService),
        db.ref("config").withSchema(TableName.AgentVaultService)
      )) as TAgentVaultPersonalOauthRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault personal OAuth value" });
    }
  };

  // See compareAndSwapOauthTokens. A reconnect replaces the row, so a refresh racing one finds its id gone and loses.
  const compareAndSwapOauth = async (
    {
      id,
      expectedEncryptedValue,
      encryptedValue,
      oauthConfigPatch,
      keepAdditionalScopesStatus
    }: {
      id: string;
      expectedEncryptedValue: Buffer;
      encryptedValue?: Buffer;
      oauthConfigPatch: Record<string, unknown>;
      keepAdditionalScopesStatus?: boolean;
    },
    tx?: Knex
  ) => {
    try {
      return await compareAndSwapOauthTokens<Pick<TAgentVaultPersonalValues, "id" | "oauthConfig">>(
        db,
        OAUTH_TOKEN_COLUMNS,
        {
          where: { id },
          expectedSecret: expectedEncryptedValue,
          secret: encryptedValue,
          configPatch: oauthConfigPatch,
          keepAdditionalScopesStatus,
          returning: ["id", "oauthConfig"]
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault personal OAuth value" });
    }
  };

  // See addOauthRequiredScopes.
  const addRequiredScopes = async (
    {
      id,
      expectedEncryptedValue,
      rejectedTokenHash,
      requiredScopes
    }: { id: string; expectedEncryptedValue: Buffer; rejectedTokenHash: string; requiredScopes: string[] },
    tx?: Knex
  ) => {
    try {
      return await addOauthRequiredScopes<Pick<TAgentVaultPersonalValues, "id" | "oauthConfig">>(
        db,
        OAUTH_TOKEN_COLUMNS,
        {
          where: { id },
          expectedSecret: expectedEncryptedValue,
          rejectedTokenHash,
          requiredScopes,
          returning: ["id", "oauthConfig"]
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault personal OAuth required scopes" });
    }
  };

  return {
    ...orm,
    findOauthForOwner,
    compareAndSwapOauth,
    addRequiredScopes,
    deleteForServiceExceptFields,
    findServicesNeedingValues,
    findForOwner,
    lockForOwnerAndService,
    findForResolve,
    findProjectIdsWithValues,
    findProjectIdsWithAnyValues,
    deleteForActorsOutsideProject,
    lockProjectMembershipsForOwner
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
