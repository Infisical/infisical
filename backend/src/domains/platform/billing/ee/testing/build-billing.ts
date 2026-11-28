import { randomUUID } from "node:crypto";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { FakeUsageMeteringService } from "@app/domains/platform/license/ce/testing/fake-usage-metering-service";
import {
  actorContext,
  actorOrg,
  identityPrincipal,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { buildOrganizations } from "@app/domains/platform/organizations/ce/testing/build-organizations";
import { FakeOrganizationsService } from "@app/domains/platform/organizations/ce/testing/fake-organizations-service";
import { FakeProjectsService } from "@app/domains/platform/projects/ce/testing/fake-projects-service";
import type { TIdentityPrincipal, TUserPrincipal } from "@app/lib/auth/principal";

import { BillingEeModule } from "../module";
import { TBillingConfig } from "../services/dependencies";
import { FakeLicenseServerBilling } from "./fake-license-server-billing";

export const SITE_URL = "https://app.infisical.test";

// A fixed clock: 2026-11-27T12:00:00Z.
export const NOW = new Date("2026-11-27T12:00:00Z");

// Billing on fakes, with the real org permission service over in-memory Access Control, so who may read or change
// billing is decided the way it is in production. One root org with a sub-org; members are added with `member`.
export const buildBilling = ({ config = {} }: { config?: Partial<TBillingConfig> } = {}) => {
  const accessControl = buildAccessControl();
  const { orgPermissionService } = buildOrganizations(accessControl);
  const organizationsService = new FakeOrganizationsService();
  const projectsService = new FakeProjectsService();
  const licenseService = new FakeLicenseService();
  const usageMeteringService = new FakeUsageMeteringService();
  const licenseBilling = new FakeLicenseServerBilling();
  const module = new BillingEeModule({
    orgPermissionService,
    organizationsService,
    projectsService,
    licenseService,
    usageMeteringService,
    licenseBilling,
    config: { isCloud: true, siteUrl: SITE_URL, ...config }
  });

  const root = actorOrg({ name: "acme" });
  const sub = actorOrg({ name: "acme-sub", rootOrgId: root.id, parentOrgId: root.id });
  organizationsService.setRoot(root.id, root.id).setRoot(sub.id, root.id);

  // A user in the org with a built-in role; null role means not a member at all.
  const member = async (
    role: OrgMembershipRole | null,
    { org = root, principal = {} }: { org?: typeof root; principal?: Partial<TUserPrincipal> } = {}
  ) => {
    const user = userPrincipal({ id: randomUUID(), ...principal });
    if (role) {
      await accessControl.seed.membership({
        scope: AccessScope.Organization,
        orgId: org.id,
        actor: { userId: user.id },
        roles: [{ role }]
      });
    }
    // A new context per call: permission services memoize per context, as per request.
    return () => actorContext({ principal: user, org });
  };

  const identity = (principal: Partial<TIdentityPrincipal> = {}, org = root) => {
    const id = identityPrincipal({ id: randomUUID(), ...principal });
    return () => actorContext({ principal: id, org });
  };

  return {
    module,
    licenseBilling,
    licenseService,
    usageMeteringService,
    organizationsService,
    projectsService,
    root,
    sub,
    member,
    identity
  };
};
