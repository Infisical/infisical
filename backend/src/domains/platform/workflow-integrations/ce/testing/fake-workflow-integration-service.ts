import { WorkflowIntegration } from "../models/workflow-integration";
import { TFindInOrgInput, TWorkflowIntegrationService } from "../services/workflow-integration/service";

// For products that check an integration id they store: the lookups behave like the real ones over `add`ed
// integrations (another org's or another provider's reads as missing). listByOrg is the domain's own route.
export class FakeWorkflowIntegrationService implements TWorkflowIntegrationService {
  private readonly integrations = new Map<string, WorkflowIntegration>();

  add = (...integrations: WorkflowIntegration[]) => {
    integrations.forEach((integration) => this.integrations.set(integration.id, integration));
    return this;
  };

  // eslint-disable-next-line class-methods-use-this
  listByOrg = async (): Promise<WorkflowIntegration[]> => {
    throw new Error("FakeWorkflowIntegrationService.listByOrg is the domain's own route; test it on the real service");
  };

  findInOrg = async ({ orgId, id, provider }: TFindInOrgInput) => {
    const integration = this.integrations.get(id);
    if (!integration || integration.orgId !== orgId) return null;
    if (provider && !integration.isProvider(provider)) return null;
    return integration;
  };

  listInOrg = async ({ orgId, ids }: { orgId: string; ids: string[] }) =>
    ids
      .map((id) => this.integrations.get(id))
      .filter((integration): integration is WorkflowIntegration => integration?.orgId === orgId);
}
