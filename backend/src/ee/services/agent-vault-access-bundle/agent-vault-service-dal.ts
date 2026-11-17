import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServices } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import {
  addOauthRequiredScopes,
  compareAndSwapOauthTokens,
  TOauthTokenColumns
} from "../agent-vault-oauth/agent-vault-oauth-token-dal-fns";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";

export type TAgentVaultServiceDALFactory = ReturnType<typeof agentVaultServiceDALFactory>;

export type TAgentVaultServiceOrderBy = "name" | "type" | "createdAt";

// A project's own service, not one sent with a session, so it always has a name.
export type TAgentVaultCatalogService = TAgentVaultServices & { name: string };

const LINK = TableName.AgentVaultAccessBundleService;

type TOauthTokenServiceRow = Pick<TAgentVaultServices, "id" | "hostPattern" | "config" | "credentialConfig">;

const SERVICE_TOKEN_COLUMNS: TOauthTokenColumns = {
  table: TableName.AgentVaultService,
  secretColumn: "encryptedCredential",
  configColumn: "credentialConfig"
};

const TOKEN_SERVICE_ROW_COLUMNS = ["id", "hostPattern", "config", "credentialConfig"];

export const agentVaultServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultService);

  // Services linked to the bundle, never an inline one, which no bundle holds.
  const catalogInBundle = (conn: Knex, accessBundleId: string) =>
    conn(TableName.AgentVaultService)
      .join(LINK, `${LINK}.serviceId`, `${TableName.AgentVaultService}.id`)
      .where(`${LINK}.accessBundleId`, accessBundleId)
      .whereNull(`${TableName.AgentVaultService}.sessionId`);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultCatalogService[]> => {
    try {
      return (await catalogInBundle(tx || db.replicaNode(), accessBundleId)
        .select(`${TableName.AgentVaultService}.*`)
        .orderBy(`${TableName.AgentVaultService}.name`, "asc")) as TAgentVaultCatalogService[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services" });
    }
  };

  // In id order, so two transactions locking the same services queue for them the same way.
  const lockByAccessBundleId = async (accessBundleId: string, tx: Knex): Promise<{ id: string }[]> => {
    try {
      return (await catalogInBundle(tx, accessBundleId)
        .orderBy(`${TableName.AgentVaultService}.id`, "asc")
        .forUpdate(TableName.AgentVaultService)
        .select(`${TableName.AgentVaultService}.id`)) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault services" });
    }
  };

  // Reads the primary even without a tx, so the row is never older than the last committed save.
  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultCatalogService | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultService).where({ id, projectId }).whereNull("sessionId").first()) as
        | TAgentVaultCatalogService
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service" });
    }
  };

  // A scope report or token refresh is a single UPDATE that only checks the sealed credential, so a save that read
  // the row without this lock could write over one that committed in between.
  const lockByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultCatalogService | undefined> => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ id, projectId })
        .whereNull("sessionId")
        .forUpdate()
        .first()) as TAgentVaultCatalogService | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault service" });
    }
  };

  const findByNameInProject = async (
    { name, projectId }: { name: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultCatalogService | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultService)
        .where({ name, projectId })
        .whereNull("sessionId")
        .first()) as TAgentVaultCatalogService | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service by name" });
    }
  };

  /**
   * A page of the project's services by name. `serviceIds` null is every service; otherwise only those of them.
   * Reads the primary even without a tx, so a service saved a moment ago is listed.
   */
  const findForList = async (
    {
      projectId,
      serviceIds,
      excludeServiceIds,
      search,
      orderBy = "name",
      orderDirection = "asc",
      limit,
      offset
    }: {
      projectId: string;
      serviceIds: string[] | null;
      excludeServiceIds?: string[];
      search?: string;
      orderBy?: TAgentVaultServiceOrderBy;
      orderDirection?: "asc" | "desc";
      limit: number;
      offset: number;
    },
    tx?: Knex
  ): Promise<{ services: TAgentVaultCatalogService[]; totalCount: number }> => {
    if (serviceIds?.length === 0) return { services: [], totalCount: 0 };
    try {
      const conn = tx || db;
      const listed = () => {
        const query = conn(TableName.AgentVaultService).where({ projectId }).whereNull("sessionId");
        if (serviceIds) void query.whereIn("id", serviceIds);
        if (excludeServiceIds?.length) void query.whereNotIn("id", excludeServiceIds);
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb.whereILike("name", term).orWhereILike("description", term).orWhereILike("hostPattern", term);
          });
        }
        return query;
      };
      const count = (await listed().count("id as count").first()) as { count: string } | undefined;
      const services = (await listed()
        .orderBy(orderBy, orderDirection)
        // A total order, so pages never repeat or skip a service that ties.
        .orderBy("name", "asc")
        .orderBy("id", "asc")
        .limit(limit)
        .offset(offset)
        .select("*")) as TAgentVaultCatalogService[];
      return { services, totalCount: parseInt(count?.count || "0", 10) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault services" });
    }
  };

  // The project's services reachable through these bundles. Reads the primary even without a tx.
  const findIdsInBundles = async (accessBundleIds: string[], tx?: Knex): Promise<string[]> => {
    if (!accessBundleIds.length) return [];
    try {
      const rows = (await (tx || db)(LINK).whereIn("accessBundleId", accessBundleIds).distinct("serviceId")) as {
        serviceId: string;
      }[];
      return rows.map((row) => row.serviceId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services in access bundles" });
    }
  };

  /**
   * The bundles each service is in, by service, ordered by name. `accessBundleIds` null returns every bundle;
   * otherwise only those of them. Reads the primary even without a tx, so a link made a moment ago is listed.
   */
  const findBundlesForServices = async (
    serviceIds: string[],
    accessBundleIds: string[] | null,
    tx?: Knex
  ): Promise<Map<string, { id: string; name: string }[]>> => {
    const byService = new Map<string, { id: string; name: string }[]>();
    if (!serviceIds.length || accessBundleIds?.length === 0) return byService;
    try {
      const query = (tx || db)(LINK)
        .join(TableName.AgentVaultAccessBundle, `${LINK}.accessBundleId`, `${TableName.AgentVaultAccessBundle}.id`)
        .whereIn(`${LINK}.serviceId`, serviceIds);
      if (accessBundleIds) void query.whereIn(`${LINK}.accessBundleId`, accessBundleIds);
      const rows = (await query
        .select(
          db.ref("serviceId").withSchema(LINK),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as {
        serviceId: string;
        id: string;
        name: string;
      }[];
      rows.forEach(({ serviceId, id, name }) =>
        byService.set(serviceId, [...(byService.get(serviceId) ?? []), { id, name }])
      );
      return byService;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services' access bundles" });
    }
  };

  const findLink = async (
    { accessBundleId, serviceId }: { accessBundleId: string; serviceId: string },
    tx?: Knex
  ): Promise<{ id: string } | undefined> => {
    try {
      return (await (tx || db)(LINK).where({ accessBundleId, serviceId }).first("id")) as { id: string } | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle service" });
    }
  };

  const insertLinks = async (rows: { accessBundleId: string; serviceId: string }[], tx: Knex) => {
    if (!rows.length) return;
    try {
      await tx(LINK).insert(rows);
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault services to access bundles" });
    }
  };

  const deleteLink = async ({ accessBundleId, serviceId }: { accessBundleId: string; serviceId: string }, tx: Knex) => {
    try {
      return await tx(LINK).where({ accessBundleId, serviceId }).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Remove agent vault service from access bundle" });
    }
  };

  // The release before project services resolved a bundle's services by agent_vault_services.accessBundleId, so a pod
  // still running it during a rollout keeps brokering a removed service until this column stops naming the bundle.
  const clearLegacyAccessBundle = async (
    { accessBundleId, serviceId }: { accessBundleId: string; serviceId: string },
    tx: Knex
  ) => {
    try {
      await tx(TableName.AgentVaultService).where({ id: serviceId, accessBundleId }).update({ accessBundleId: null });
    } catch (error) {
      throw new DatabaseError({ error, name: "Clear legacy agent vault service access bundle" });
    }
  };

  const findByIdPrimary = async (id: string, tx?: Knex): Promise<TAgentVaultServices | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultService).where({ id }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service" });
    }
  };

  // See compareAndSwapOauthTokens. Only for a service holding its own tokens.
  const compareAndSwapCredential = async (
    {
      id,
      expectedEncryptedCredential,
      encryptedCredential,
      credentialConfigPatch,
      keepAdditionalScopesStatus
    }: {
      id: string;
      expectedEncryptedCredential: Buffer;
      encryptedCredential?: Buffer;
      credentialConfigPatch: Record<string, unknown>;
      keepAdditionalScopesStatus?: boolean;
    },
    tx?: Knex
  ) => {
    try {
      return await compareAndSwapOauthTokens<TOauthTokenServiceRow>(
        db,
        SERVICE_TOKEN_COLUMNS,
        {
          where: { id },
          expectedSecret: expectedEncryptedCredential,
          secret: encryptedCredential,
          configPatch: credentialConfigPatch,
          keepAdditionalScopesStatus,
          returning: TOKEN_SERVICE_ROW_COLUMNS
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault service credential" });
    }
  };

  // See addOauthRequiredScopes.
  const addRequiredScopes = async (
    {
      id,
      expectedEncryptedCredential,
      rejectedTokenHash,
      requiredScopes
    }: { id: string; expectedEncryptedCredential: Buffer; rejectedTokenHash: string; requiredScopes: string[] },
    tx?: Knex
  ) => {
    try {
      return await addOauthRequiredScopes<TOauthTokenServiceRow>(
        db,
        SERVICE_TOKEN_COLUMNS,
        {
          where: { id, credentialType: AgentVaultCredentialType.OAuth },
          expectedSecret: expectedEncryptedCredential,
          rejectedTokenHash,
          requiredScopes,
          returning: TOKEN_SERVICE_ROW_COLUMNS
        },
        tx
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault service required scopes" });
    }
  };

  // A personal values save holds this until it commits. A service update writes the row, so it waits for the
  // save, and a save that starts after the update reads the fields the update left.
  const lockForPersonalValues = async (
    id: string,
    tx: Knex
  ): Promise<
    | Pick<
        TAgentVaultServices,
        "id" | "credentialType" | "memberProvidedFields" | "config" | "credentialConfig" | "encryptedCredential"
      >
    | undefined
  > => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ id })
        .forShare()
        .first("id", "credentialType", "memberProvidedFields", "config", "credentialConfig", "encryptedCredential")) as
        | Pick<
            TAgentVaultServices,
            "id" | "credentialType" | "memberProvidedFields" | "config" | "credentialConfig" | "encryptedCredential"
          >
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault service for personal values" });
    }
  };

  return {
    ...orm,
    findByAccessBundleId,
    lockByAccessBundleId,
    findByIdInProject,
    lockByIdInProject,
    findByNameInProject,
    findForList,
    findIdsInBundles,
    findBundlesForServices,
    findLink,
    insertLinks,
    deleteLink,
    clearLegacyAccessBundle,
    findByIdPrimary,
    lockForPersonalValues,
    compareAndSwapCredential,
    addRequiredScopes
  };
};
