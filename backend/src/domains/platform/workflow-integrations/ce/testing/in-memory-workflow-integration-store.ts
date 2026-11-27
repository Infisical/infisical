import { DatabaseError } from "@app/lib/errors";

import { WorkflowIntegrationProvider } from "../models/enums";
import { TWorkflowIntegrationRecord, WorkflowIntegration } from "../models/workflow-integration";
import { TWorkflowIntegrationFilter, TWorkflowIntegrationStore } from "../services/dependencies";

type TStoredRow = { sequence: number; record: TWorkflowIntegrationRecord };

const copyBuffer = (buffer: Buffer | null) => (buffer ? Buffer.from(buffer) : null);
const copyDate = (date: Date | null) => (date ? new Date(date) : null);

const copyRecord = (record: TWorkflowIntegrationRecord): TWorkflowIntegrationRecord => {
  if (record.provider === WorkflowIntegrationProvider.Slack) {
    return {
      ...record,
      slack: { ...record.slack, encryptedBotAccessToken: Buffer.from(record.slack.encryptedBotAccessToken) }
    };
  }
  const teams = record.microsoftTeams;
  return {
    ...record,
    microsoftTeams: {
      ...teams,
      encryptedAccessToken: copyBuffer(teams.encryptedAccessToken),
      accessTokenExpiresAt: copyDate(teams.accessTokenExpiresAt),
      encryptedBotAccessToken: copyBuffer(teams.encryptedBotAccessToken),
      botAccessTokenExpiresAt: copyDate(teams.botAccessTokenExpiresAt)
    }
  };
};

const toModel = (row: TStoredRow) => WorkflowIntegration.restore(copyRecord(row.record));

export class InMemoryWorkflowIntegrationStore implements TWorkflowIntegrationStore {
  private rows = new Map<string, TStoredRow>();

  private nextSequence = 0;

  snapshot(): unknown {
    return {
      nextSequence: this.nextSequence,
      rows: [...this.rows.entries()].map(([id, row]) => [id, { ...row, record: copyRecord(row.record) }] as const)
    };
  }

  restore(snapshot: unknown) {
    const state = snapshot as { nextSequence: number; rows: (readonly [string, TStoredRow])[] };
    this.nextSequence = state.nextSequence;
    this.rows = new Map(state.rows.map(([id, row]) => [id, { ...row, record: copyRecord(row.record) }]));
  }

  async findById(id: string) {
    return this.read(id);
  }

  async findByIdForUpdate(id: string) {
    return this.read(id);
  }

  async listByOrg(orgId: string, filter?: TWorkflowIntegrationFilter) {
    return this.oldestFirst(
      (row) =>
        row.record.orgId === orgId &&
        (!filter?.provider || row.record.provider === filter.provider) &&
        (!filter?.status || row.record.status === filter.status)
    ).map(toModel);
  }

  async listByIds(ids: string[]) {
    return this.oldestFirst((row) => ids.includes(row.record.id)).map(toModel);
  }

  async findMicrosoftTeamsByTenantId(tenantId: string) {
    const [oldest] = this.oldestFirst(
      (row) =>
        row.record.provider === WorkflowIntegrationProvider.MicrosoftTeams &&
        row.record.microsoftTeams.tenantId === tenantId
    );
    return oldest ? toModel(oldest) : null;
  }

  async create(integration: WorkflowIntegration) {
    const record = integration.toJSON();
    const duplicate = [...this.rows.values()].some(
      (row) => row.record.orgId === record.orgId && row.record.slug === record.slug
    );
    if (duplicate || this.rows.has(record.id))
      throw new DatabaseError({
        error: new Error("duplicate workflow integration"),
        name: "Create workflow integration"
      });
    this.nextSequence += 1;
    this.rows.set(record.id, { sequence: this.nextSequence, record: copyRecord(record) });
  }

  async save(integration: WorkflowIntegration) {
    const record = integration.toJSON();
    const existing = this.rows.get(record.id);
    if (!existing) return;
    const duplicate = [...this.rows.values()].some(
      (row) => row.record.id !== record.id && row.record.orgId === record.orgId && row.record.slug === record.slug
    );
    if (duplicate)
      throw new DatabaseError({
        error: new Error("duplicate workflow integration slug"),
        name: "Save workflow integration"
      });
    this.rows.set(record.id, { sequence: existing.sequence, record: copyRecord(record) });
  }

  async delete(id: string) {
    this.rows.delete(id);
  }

  private read(id: string) {
    const row = this.rows.get(id);
    return row ? toModel(row) : null;
  }

  private oldestFirst(predicate: (row: TStoredRow) => boolean) {
    return [...this.rows.values()].filter(predicate).sort((a, b) => a.sequence - b.sequence);
  }
}
