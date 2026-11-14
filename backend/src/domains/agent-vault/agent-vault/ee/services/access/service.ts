import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { TAgentVaultAccessService } from "../../../ce/services/dependencies";
import { AgentVaultAccess } from "../../models/agent-vault-access";
import { TAgentVaultFreeUsageCache } from "../dependencies";

export class AgentVaultAccessService implements TAgentVaultAccessService {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getPlan" | "getInstanceEntitlements">,
    private readonly organizationsProjectsService: Pick<TOrganizationsProjectsService, "resolveRootOrgId">,
    private readonly freeUsageCache: Pick<TAgentVaultFreeUsageCache, "read">
  ) {}

  async assertCanBroker(orgId: string): Promise<void> {
    const isCloud = this.licenseService.getInstanceEntitlements().isCloud();
    if (!isCloud) return;

    const plan = await this.licenseService.getPlan(orgId);
    if (!AgentVaultAccess.isLimited({ isCloud, plan })) return;

    const now = new Date();
    const used = await this.readFreeUsage(orgId, now);
    AgentVaultAccess.decide({ isCloud, plan, used, now }).assertAllowed();
  }

  async getAccess(orgId: string): Promise<AgentVaultAccess> {
    const isCloud = this.licenseService.getInstanceEntitlements().isCloud();
    const plan = await this.licenseService.getPlan(orgId);
    if (!AgentVaultAccess.isLimited({ isCloud, plan })) return AgentVaultAccess.decide({ isCloud, plan, used: null });

    const now = new Date();
    return AgentVaultAccess.decide({ isCloud, plan, used: await this.readFreeUsage(orgId, now), now });
  }

  // Null when the count can't be read, which allows: a key store outage never blocks brokering.
  private async readFreeUsage(orgId: string, now: Date): Promise<number | null> {
    const rootOrgId = await this.organizationsProjectsService.resolveRootOrgId(orgId);
    try {
      return await this.freeUsageCache.read(rootOrgId, now);
    } catch (error) {
      logger.error(error, `Failed to read Agent Vault free usage [rootOrgId=${rootOrgId}], allowing`);
      return null;
    }
  }
}
