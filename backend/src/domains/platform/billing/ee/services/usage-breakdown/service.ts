import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import {
  TOrganization,
  TOrganizationsService,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { TProjectsService } from "@app/domains/platform/projects/ce/module";

import { BillingAccess } from "../../models/billing-access";
import { BreakdownDimension, TBreakdownDimensionKey } from "../../models/breakdown-dimension";
import { TUsageBreakdownView, UsageBreakdown } from "../../models/usage-breakdown";
import { TBillingConfig } from "../dependencies";
import { assertBillingRead } from "../helpers/billing-access";

// The meters a breakdown is offered for, by the key the API takes.
export const BreakdownDimensionKey = {
  Identities: "identities",
  UserIdentities: "user_identities",
  SecretIdentities: "secret_identities",
  PamIdentities: "pam_identities",
  InternalCas: "internal_cas",
  ActiveCerts: "active_certs",
  WildcardCerts: "wildcard_certs"
} as const satisfies Record<string, TBreakdownDimensionKey>;

export enum BreakdownScope {
  // Every org on a self-hosted instance, which its license is billed on.
  Instance = "instance",
  Organization = "organization"
}

export type TGetUsageBreakdownInput = {
  orgId: string;
  actor: TActorContext;
  dimensionKey: string;
  scope?: BreakdownScope;
};

export type TListBillableOrganizationsInput = {
  orgId: string;
  actor: TActorContext;
  search?: string;
  limit: number;
  offset: number;
};

export type TUsageBreakdownService = {
  getUsageBreakdown(input: TGetUsageBreakdownInput): Promise<{ breakdown: TUsageBreakdownView }>;
  // The root orgs whose billing the actor reads: their own, or every one for a self-hosted instance admin.
  getBillableOrganizations(
    input: TListBillableOrganizationsInput
  ): Promise<{ organizations: TOrganization[]; totalCount: number }>;
};

// Where a billed count comes from, by org and project.
export class UsageBreakdownService implements TUsageBreakdownService {
  constructor(
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly organizationsService: TOrganizationsService,
    private readonly projectsService: TProjectsService,
    private readonly usageMeteringService: TUsageMeteringService,
    private readonly billingConfig: TBillingConfig
  ) {}

  async getUsageBreakdown({
    orgId,
    actor,
    dimensionKey,
    scope = BreakdownScope.Organization
  }: TGetUsageBreakdownInput): Promise<{ breakdown: TUsageBreakdownView }> {
    const access = BillingAccess.of(actor.principal, this.billingConfig.isCloud);
    await assertBillingRead(this.orgPermissionService, { actor, orgId, access });

    const isInstanceWide = scope === BreakdownScope.Instance;
    if (isInstanceWide) access.assertInstanceWide();

    const organization = await this.organizationsService.findOrganization(orgId);
    if (!organization) {
      throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    const dimension = BreakdownDimension.fromKey(dimensionKey);
    // On self-hosted the meters count the whole database, so the instance-wide roster lists every org; a tree's
    // roster would leave the parts short of the billed figure.
    const rootOrgId = isInstanceWide ? null : await this.organizationsService.resolveRootOrgId(orgId);
    const usage = dimension ? await this.usageMeteringService.getUsageBreakdown(dimension.meter, rootOrgId) : null;
    if (!dimension || !usage) {
      throw new RuleViolationError({
        message: `'${dimensionKey}' is not a usage dimension that can be broken down by scope.`
      });
    }

    const [orgs, projects] = dimension.isScoped
      ? await Promise.all([
          rootOrgId
            ? this.organizationsService.listOrgTreeNames(rootOrgId)
            : this.organizationsService.listAllOrgNames(),
          this.projectsService.findProjectNames(UsageBreakdown.projectIdsIn(dimension, usage))
        ])
      : [[], []];

    return {
      breakdown: UsageBreakdown.assemble({ dimension, usage, orgs, projects, keepEmptyOrgId: rootOrgId }).toJSON()
    };
  }

  async getBillableOrganizations({
    orgId,
    actor,
    search,
    limit,
    offset
  }: TListBillableOrganizationsInput): Promise<{ organizations: TOrganization[]; totalCount: number }> {
    const access = BillingAccess.of(actor.principal, this.billingConfig.isCloud);
    await assertBillingRead(this.orgPermissionService, { actor, orgId, access });

    if (access.canReadAcrossOrgs()) {
      return this.organizationsService.listRootOrganizations({ search, limit, offset });
    }

    // The read check refuses a sub-org, so orgId is the actor's root and the list is that one org.
    const organization = await this.organizationsService.findOrganization(orgId);
    if (!organization) {
      throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }
    const term = search?.toLowerCase();
    const matches = term
      ? organization.name.toLowerCase().includes(term) || organization.slug.toLowerCase().includes(term)
      : true;
    const organizations = matches ? [{ id: organization.id, name: organization.name, slug: organization.slug }] : [];
    return { organizations: organizations.slice(offset, offset + limit), totalCount: organizations.length };
  }
}
