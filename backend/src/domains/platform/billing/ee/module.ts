import { TLicenseServerBilling, TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService, TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";
import { TProjectsService } from "@app/domains/platform/projects/ce/module";

import { BillingOverviewService, TBillingOverviewService } from "./services/billing-overview/service";
import { TBillingConfig } from "./services/dependencies";
import { SubscriptionService, TSubscriptionService } from "./services/subscription/service";
import { TrialService, TTrialService } from "./services/trial/service";
import { TUsageBreakdownService, UsageBreakdownService } from "./services/usage-breakdown/service";

export type { TBillingOverviewService } from "./services/billing-overview/service";
export type { TBillingConfig } from "./services/dependencies";
export type { TSubscriptionService } from "./services/subscription/service";
export type { TTrialService } from "./services/trial/service";
export type { TUsageBreakdownService } from "./services/usage-breakdown/service";

export type TBillingDeps = {
  orgPermissionService: TOrgPermissionService;
  organizationsService: TOrganizationsService;
  projectsService: TProjectsService;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  // The License Server's billing endpoints. Only Billing calls them.
  licenseBilling: TLicenseServerBilling;
  config: TBillingConfig;
};

// The billing portal an org's billing admins use: what the org holds and pays, buying and changing products, trials,
// and where usage comes from. Owns no tables: the License Server holds the subscription, License the plan and meters.
export class BillingEeModule {
  readonly billingOverviewService: TBillingOverviewService;

  readonly usageBreakdownService: TUsageBreakdownService;

  readonly subscriptionService: TSubscriptionService;

  readonly trialService: TTrialService;

  constructor(deps: TBillingDeps) {
    const now = () => new Date();
    this.billingOverviewService = new BillingOverviewService(
      deps.orgPermissionService,
      deps.organizationsService,
      deps.licenseBilling,
      deps.licenseService,
      deps.config,
      now
    );
    this.usageBreakdownService = new UsageBreakdownService(
      deps.orgPermissionService,
      deps.organizationsService,
      deps.projectsService,
      deps.usageMeteringService,
      deps.config
    );
    this.subscriptionService = new SubscriptionService(
      deps.orgPermissionService,
      deps.licenseBilling,
      deps.licenseService,
      deps.usageMeteringService,
      deps.config,
      now
    );
    this.trialService = new TrialService(
      deps.orgPermissionService,
      deps.organizationsService,
      deps.licenseBilling,
      deps.licenseService,
      deps.usageMeteringService,
      deps.config
    );
  }
}
