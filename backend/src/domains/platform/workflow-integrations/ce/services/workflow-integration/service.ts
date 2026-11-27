import { TActorContext } from "@app/domains/lib/actor-context";
import { ReadFrom } from "@app/domains/lib/data-access";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";

import { WorkflowIntegrationProvider } from "../../models/enums";
import { WorkflowIntegration } from "../../models/workflow-integration";
import { TWorkflowIntegrationStore } from "../dependencies";

export type TFindInOrgInput = {
  orgId: string;
  id: string;
  provider?: WorkflowIntegrationProvider;
  readFrom?: ReadFrom;
};

export type TWorkflowIntegrationService = {
  // Every integration in the actor's org, any provider or status.
  listByOrg(input: { actor: TActorContext }): Promise<WorkflowIntegration[]>;
  // For products that keep an integration id in their own settings: null when the id is not an integration of this
  // org (of this provider, when given), so another org's id reads as missing.
  findInOrg(input: TFindInOrgInput): Promise<WorkflowIntegration | null>;
  // The org's integrations among `ids`; ids of other orgs or of nothing are left out.
  listInOrg(input: { orgId: string; ids: string[] }): Promise<WorkflowIntegration[]>;
  // Any org's integration (of this provider, when given). Only for a caller whose existing API answers another org's
  // integration differently from a missing one; everything else uses findInOrg.
  findById(input: { id: string; provider?: WorkflowIntegrationProvider }): Promise<WorkflowIntegration | null>;
};

export class WorkflowIntegrationService implements TWorkflowIntegrationService {
  constructor(
    private readonly workflowIntegrationStore: TWorkflowIntegrationStore,
    private readonly orgPermissionService: TOrgPermissionService
  ) {}

  async listByOrg({ actor }: { actor: TActorContext }): Promise<WorkflowIntegration[]> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings });
    return this.workflowIntegrationStore.listByOrg(actor.org.id);
  }

  async findInOrg({ orgId, id, provider, readFrom }: TFindInOrgInput): Promise<WorkflowIntegration | null> {
    const integration = await this.workflowIntegrationStore.findById(id, { readFrom });
    if (!integration || integration.orgId !== orgId) return null;
    if (provider && !integration.isProvider(provider)) return null;
    return integration;
  }

  async findById({
    id,
    provider
  }: {
    id: string;
    provider?: WorkflowIntegrationProvider;
  }): Promise<WorkflowIntegration | null> {
    const integration = await this.workflowIntegrationStore.findById(id);
    if (!integration || (provider && !integration.isProvider(provider))) return null;
    return integration;
  }

  async listInOrg({ orgId, ids }: { orgId: string; ids: string[] }): Promise<WorkflowIntegration[]> {
    if (ids.length === 0) return [];
    const integrations = await this.workflowIntegrationStore.listByIds(ids);
    return integrations.filter((integration) => integration.orgId === orgId);
  }
}
