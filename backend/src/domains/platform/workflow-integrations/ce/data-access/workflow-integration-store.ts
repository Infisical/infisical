import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../models/enums";
import { WorkflowIntegration } from "../models/workflow-integration";
import { TWorkflowIntegrationFilter, TWorkflowIntegrationStore } from "../services/dependencies";

type TJoinedRow = {
  id: string;
  orgId: string;
  slug: string;
  description: string | null;
  integration: string;
  status: string;
  slackTeamId: string | null;
  slackTeamName: string | null;
  slackUserId: string | null;
  slackAppId: string | null;
  slackBotId: string | null;
  slackBotUserId: string | null;
  slackEncryptedBotAccessToken: Buffer | null;
  teamsTenantId: string | null;
  teamsInternalTeamsAppId: string | null;
  teamsEncryptedAccessToken: Buffer | null;
  teamsAccessTokenExpiresAt: Date | null;
  teamsEncryptedBotAccessToken: Buffer | null;
  teamsBotAccessTokenExpiresAt: Date | null;
};

const toModel = (row: TJoinedRow): WorkflowIntegration => {
  const base = {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    description: row.description,
    status: row.status as WorkflowIntegrationStatus
  };
  if (row.integration === WorkflowIntegrationProvider.Slack) {
    return WorkflowIntegration.restore({
      ...base,
      provider: WorkflowIntegrationProvider.Slack,
      slack: {
        teamId: row.slackTeamId as string,
        teamName: row.slackTeamName as string,
        slackUserId: row.slackUserId as string,
        slackAppId: row.slackAppId as string,
        slackBotId: row.slackBotId as string,
        slackBotUserId: row.slackBotUserId as string,
        encryptedBotAccessToken: row.slackEncryptedBotAccessToken as Buffer
      }
    });
  }
  return WorkflowIntegration.restore({
    ...base,
    provider: WorkflowIntegrationProvider.MicrosoftTeams,
    microsoftTeams: {
      tenantId: row.teamsTenantId as string,
      internalTeamsAppId: row.teamsInternalTeamsAppId,
      encryptedAccessToken: row.teamsEncryptedAccessToken,
      accessTokenExpiresAt: row.teamsAccessTokenExpiresAt,
      encryptedBotAccessToken: row.teamsEncryptedBotAccessToken,
      botAccessTokenExpiresAt: row.teamsBotAccessTokenExpiresAt
    }
  });
};

// Provider rows share the id of their workflow_integrations row, and an integration has exactly one of them.
const joined = (knex: Knex) =>
  knex(TableName.WorkflowIntegrations)
    .leftJoin(TableName.SlackIntegrations, `${TableName.SlackIntegrations}.id`, `${TableName.WorkflowIntegrations}.id`)
    .leftJoin(
      TableName.MicrosoftTeamsIntegrations,
      `${TableName.MicrosoftTeamsIntegrations}.id`,
      `${TableName.WorkflowIntegrations}.id`
    )
    .select(
      knex.ref("id").withSchema(TableName.WorkflowIntegrations),
      knex.ref("orgId").withSchema(TableName.WorkflowIntegrations),
      knex.ref("slug").withSchema(TableName.WorkflowIntegrations),
      knex.ref("description").withSchema(TableName.WorkflowIntegrations),
      knex.ref("integration").withSchema(TableName.WorkflowIntegrations),
      knex.ref("status").withSchema(TableName.WorkflowIntegrations),
      knex.ref("teamId").withSchema(TableName.SlackIntegrations).as("slackTeamId"),
      knex.ref("teamName").withSchema(TableName.SlackIntegrations).as("slackTeamName"),
      knex.ref("slackUserId").withSchema(TableName.SlackIntegrations),
      knex.ref("slackAppId").withSchema(TableName.SlackIntegrations),
      knex.ref("slackBotId").withSchema(TableName.SlackIntegrations),
      knex.ref("slackBotUserId").withSchema(TableName.SlackIntegrations),
      knex.ref("encryptedBotAccessToken").withSchema(TableName.SlackIntegrations).as("slackEncryptedBotAccessToken"),
      knex.ref("tenantId").withSchema(TableName.MicrosoftTeamsIntegrations).as("teamsTenantId"),
      knex.ref("internalTeamsAppId").withSchema(TableName.MicrosoftTeamsIntegrations).as("teamsInternalTeamsAppId"),
      knex.ref("encryptedAccessToken").withSchema(TableName.MicrosoftTeamsIntegrations).as("teamsEncryptedAccessToken"),
      knex.ref("accessTokenExpiresAt").withSchema(TableName.MicrosoftTeamsIntegrations).as("teamsAccessTokenExpiresAt"),
      knex
        .ref("encryptedBotAccessToken")
        .withSchema(TableName.MicrosoftTeamsIntegrations)
        .as("teamsEncryptedBotAccessToken"),
      knex
        .ref("botAccessTokenExpiresAt")
        .withSchema(TableName.MicrosoftTeamsIntegrations)
        .as("teamsBotAccessTokenExpiresAt")
    );

const oldestFirst = <T extends Knex.QueryBuilder>(query: T): T =>
  query
    .orderBy(`${TableName.WorkflowIntegrations}.createdAt`, "asc")
    .orderBy(`${TableName.WorkflowIntegrations}.id`, "asc") as T;

export class WorkflowIntegrationStore implements TWorkflowIntegrationStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findById(id: string, options?: TReadOptions): Promise<WorkflowIntegration | null> {
    try {
      const row = (await joined(this.connection.reader(options))
        .where(`${TableName.WorkflowIntegrations}.id`, id)
        .first()) as TJoinedRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find workflow integration" });
    }
  }

  async findByIdForUpdate(id: string): Promise<WorkflowIntegration | null> {
    try {
      // FOR UPDATE is refused on the nullable side of an outer join, so it is scoped to the parent row. Every write
      // goes through save, which updates the parent too, so this covers the provider row.
      const row = (await joined(this.connection.writer())
        .where(`${TableName.WorkflowIntegrations}.id`, id)
        .forUpdate(TableName.WorkflowIntegrations)
        .first()) as TJoinedRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find workflow integration for update" });
    }
  }

  async listByOrg(
    orgId: string,
    filter?: TWorkflowIntegrationFilter,
    options?: TReadOptions
  ): Promise<WorkflowIntegration[]> {
    try {
      const query = joined(this.connection.reader(options)).where(`${TableName.WorkflowIntegrations}.orgId`, orgId);
      if (filter?.provider) query.where(`${TableName.WorkflowIntegrations}.integration`, filter.provider);
      if (filter?.status) query.where(`${TableName.WorkflowIntegrations}.status`, filter.status);
      const rows = (await oldestFirst(query)) as TJoinedRow[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "List workflow integrations by org" });
    }
  }

  async listByIds(ids: string[], options?: TReadOptions): Promise<WorkflowIntegration[]> {
    if (!ids.length) return [];
    try {
      const rows = (await oldestFirst(
        joined(this.connection.reader(options)).whereIn(`${TableName.WorkflowIntegrations}.id`, ids)
      )) as TJoinedRow[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "List workflow integrations by ids" });
    }
  }

  async findMicrosoftTeamsByTenantId(tenantId: string, options?: TReadOptions): Promise<WorkflowIntegration | null> {
    try {
      const row = (await oldestFirst(
        joined(this.connection.reader(options))
          .where(`${TableName.WorkflowIntegrations}.integration`, WorkflowIntegrationProvider.MicrosoftTeams)
          .where(`${TableName.MicrosoftTeamsIntegrations}.tenantId`, tenantId)
      ).first()) as TJoinedRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Microsoft Teams integration by tenant" });
    }
  }

  async create(integration: WorkflowIntegration): Promise<void> {
    try {
      const knex = this.connection.writer();
      const record = integration.toJSON();
      await knex(TableName.WorkflowIntegrations).insert({
        id: record.id,
        orgId: record.orgId,
        slug: record.slug,
        description: record.description,
        integration: record.provider,
        status: record.status
      } as never);
      if (record.provider === WorkflowIntegrationProvider.Slack) {
        await knex(TableName.SlackIntegrations).insert({ id: record.id, ...record.slack } as never);
      } else {
        await knex(TableName.MicrosoftTeamsIntegrations).insert({ id: record.id, ...record.microsoftTeams } as never);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Create workflow integration" });
    }
  }

  async save(integration: WorkflowIntegration): Promise<void> {
    try {
      const knex = this.connection.writer();
      const record = integration.toJSON();
      await knex(TableName.WorkflowIntegrations)
        .where({ id: record.id })
        .update({ slug: record.slug, description: record.description, status: record.status });
      if (record.provider === WorkflowIntegrationProvider.Slack) {
        await knex(TableName.SlackIntegrations).where({ id: record.id }).update(record.slack);
      } else {
        await knex(TableName.MicrosoftTeamsIntegrations).where({ id: record.id }).update(record.microsoftTeams);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Save workflow integration" });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.connection.writer()(TableName.WorkflowIntegrations).where({ id }).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete workflow integration" });
    }
  }
}
