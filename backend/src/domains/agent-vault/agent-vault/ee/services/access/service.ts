import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { TAgentVaultAccessService } from "../../../ce/services/dependencies";
import { AgentVaultAccess } from "../../models/agent-vault-access";
import { TGrandfatheredOrgCache, TGrandfatheredOrgStore } from "../dependencies";

export class AgentVaultAccessService implements TAgentVaultAccessService {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getPlan" | "getInstanceEntitlements">,
    private readonly organizationsProjectsService: Pick<TOrganizationsProjectsService, "resolveRootOrgId">,
    private readonly grandfatheredOrgReader: Pick<TGrandfatheredOrgStore, "findByOrgId">,
    private readonly grandfatheredOrgWriter: TGrandfatheredOrgStore,
    private readonly grandfatheredOrgCache: TGrandfatheredOrgCache
  ) {}

  async assertCanBroker(orgId: string): Promise<void> {
    const isCloud = this.licenseService.getInstanceEntitlements().isCloud();
    if (!isCloud) return;

    const plan = await this.licenseService.getPlan(orgId);
    const access = AgentVaultAccess.decide({ isCloud, plan, isGrandfathered: false });
    if (access.allowed) return;

    const isGrandfathered = await this.isGrandfathered(await this.organizationsProjectsService.resolveRootOrgId(orgId));
    AgentVaultAccess.decide({ isCloud, plan, isGrandfathered }).assertAllowed();
  }

  async getAccess(orgId: string): Promise<AgentVaultAccess> {
    const isCloud = this.licenseService.getInstanceEntitlements().isCloud();
    const plan = await this.licenseService.getPlan(orgId);
    if (!isCloud) return AgentVaultAccess.decide({ isCloud, plan, isGrandfathered: false });

    const rootOrgId = await this.organizationsProjectsService.resolveRootOrgId(orgId);
    const grandfatheredOrg = await this.grandfatheredOrgReader.findByOrgId(rootOrgId);

    if (grandfatheredOrg?.isActive && AgentVaultAccess.endsGrandfathering(plan)) {
      grandfatheredOrg.end();
      await this.grandfatheredOrgWriter.saveEnded(grandfatheredOrg);
      await this.grandfatheredOrgCache.forget(rootOrgId);
    }

    return AgentVaultAccess.decide({ isCloud, plan, isGrandfathered: Boolean(grandfatheredOrg?.isActive) });
  }

  private async isGrandfathered(rootOrgId: string): Promise<boolean> {
    const cached = await this.grandfatheredOrgCache.read(rootOrgId);
    if (cached !== null) return cached;

    const grandfatheredOrg = await this.grandfatheredOrgReader.findByOrgId(rootOrgId);
    const isGrandfathered = Boolean(grandfatheredOrg?.isActive);
    await this.grandfatheredOrgCache.write(rootOrgId, isGrandfathered);
    return isGrandfathered;
  }
}
