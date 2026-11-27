import { OrgMembershipRole } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { Meter } from "@app/domains/platform/license/ce/module";

import { buildBilling } from "../../testing/build-billing";
import { BreakdownScope } from "./service";

const OTHER_ORG_ID = "44444444-4444-4444-8444-444444444444";

const arrange = async ({ isCloud = true }: { isCloud?: boolean } = {}) => {
  const built = buildBilling({ config: { isCloud } });
  const { organizationsService, projectsService, root, sub } = built;
  organizationsService.orgNames = [
    { id: root.id, name: "acme", rootOrgId: null },
    { id: sub.id, name: "acme-sub", rootOrgId: root.id },
    { id: OTHER_ORG_ID, name: "elsewhere", rootOrgId: null }
  ];
  organizationsService.setRoot(OTHER_ORG_ID, OTHER_ORG_ID);
  projectsService.rows.set("p-1", {
    id: "p-1",
    name: "api",
    slug: "api",
    orgId: sub.id,
    type: "secret-manager" as never,
    enforceEncryptedSecretManagerSecretMetadata: false
  });
  const reader = await built.member(OrgMembershipRole.Member);
  return { ...built, reader };
};

describe("UsageBreakdownService.getUsageBreakdown", () => {
  test("should split secret identities by the org and project holding them, keeping the users apart", async () => {
    // Setup
    const { module, usageMeteringService, reader, root, sub } = await arrange();
    usageMeteringService.setBreakdown(Meter.SecretIdentities, root.id, {
      total: 6,
      users: 2,
      rows: [
        { orgId: sub.id, projectId: "p-1", count: 3 },
        { orgId: root.id, projectId: null, count: 1 }
      ]
    });

    // Action
    const { breakdown } = await module.usageBreakdownService.getUsageBreakdown({
      orgId: root.id,
      actor: reader(),
      dimensionKey: "secret_identities"
    });

    // Assert
    expect(breakdown).toMatchObject({
      total: 6,
      userCount: 2,
      scopedCount: 4,
      hasProjectDetail: true,
      unit: "secret identity"
    });
    expect(breakdown.scopes).toEqual([
      { orgId: root.id, name: "acme", isRoot: true, parentOrgName: null, count: 1, orgLevelCount: 1, projects: [] },
      {
        orgId: sub.id,
        name: "acme-sub",
        isRoot: false,
        parentOrgName: "acme",
        count: 3,
        orgLevelCount: 0,
        projects: [{ id: "p-1", name: "api", count: 3 }]
      }
    ]);
  });

  test("should break a sub-org's usage down at its root, since billing counts the whole tree", async () => {
    // Setup
    const { module, usageMeteringService, member, root, sub } = await arrange({ isCloud: false });
    const instanceAdmin = await member(null, { principal: { isSuperAdmin: true } });
    usageMeteringService.setBreakdown(Meter.InternalCas, root.id, { total: 0, users: 0, rows: [] });

    // Action
    await module.usageBreakdownService.getUsageBreakdown({
      orgId: sub.id,
      actor: instanceAdmin(),
      dimensionKey: "internal_cas"
    });

    // Assert
    expect(usageMeteringService.breakdownRequests).toEqual([{ meter: Meter.InternalCas, orgId: root.id }]);
  });

  test("should break the whole instance down for a self-hosted instance admin, listing every org", async () => {
    // Setup
    const { module, usageMeteringService, member, root } = await arrange({ isCloud: false });
    const instanceAdmin = await member(OrgMembershipRole.Member, { principal: { isSuperAdmin: true } });
    usageMeteringService.setBreakdown(Meter.ActiveCerts, null, {
      total: 5,
      users: 0,
      rows: [
        { orgId: OTHER_ORG_ID, projectId: null, count: 4 },
        { orgId: root.id, projectId: null, count: 1 }
      ]
    });

    // Action
    const { breakdown } = await module.usageBreakdownService.getUsageBreakdown({
      orgId: root.id,
      actor: instanceAdmin(),
      dimensionKey: "active_certs",
      scope: BreakdownScope.Instance
    });

    // Assert
    expect(breakdown.scopes.map((scope) => [scope.name, scope.count])).toEqual([
      ["elsewhere", 4],
      ["acme", 1]
    ]);
  });

  test("should refuse the instance-wide breakdown on cloud, even to an org's billing reader", async () => {
    // Setup
    const { module, usageMeteringService, reader, root } = await arrange();

    // Action
    const result = module.usageBreakdownService.getUsageBreakdown({
      orgId: root.id,
      actor: reader(),
      dimensionKey: "identities",
      scope: BreakdownScope.Instance
    });

    // Assert
    await expect(result).rejects.toThrow(
      new PermissionDeniedError({
        message: "Instance-wide usage can only be read by an instance admin on a self-hosted instance."
      })
    );
    expect(usageMeteringService.breakdownRequests).toEqual([]);
  });

  test("should refuse a sub-org, since billing belongs to the root org", async () => {
    // Setup
    const { module, usageMeteringService, member, sub } = await arrange();
    const subAdmin = await member(OrgMembershipRole.Admin, { org: sub });

    // Action
    const result = module.usageBreakdownService.getUsageBreakdown({
      orgId: sub.id,
      actor: subAdmin(),
      dimensionKey: "identities"
    });

    // Assert
    await expect(result).rejects.toThrow("Child organization cannot do this operation");
    expect(usageMeteringService.breakdownRequests).toEqual([]);
  });
});

describe("UsageBreakdownService.getBillableOrganizations", () => {
  test("should list only the actor's own root org, filtered by the search", async () => {
    // Setup
    const { module, reader, root } = await arrange();

    // Action
    const [all, miss] = await Promise.all([
      module.usageBreakdownService.getBillableOrganizations({ orgId: root.id, actor: reader(), limit: 100, offset: 0 }),
      module.usageBreakdownService.getBillableOrganizations({
        orgId: root.id,
        actor: reader(),
        search: "zzz",
        limit: 100,
        offset: 0
      })
    ]);

    // Assert
    expect(all).toEqual({
      organizations: [{ id: root.id, name: `org ${root.id}`, slug: `org-${root.id}` }],
      totalCount: 1
    });
    expect(miss).toEqual({ organizations: [], totalCount: 0 });
  });

  test("should list every root org on the instance for a self-hosted instance admin", async () => {
    // Setup
    const { module, member, root } = await arrange({ isCloud: false });
    const instanceAdmin = await member(OrgMembershipRole.Member, { principal: { isSuperAdmin: true } });

    // Action
    const result = await module.usageBreakdownService.getBillableOrganizations({
      orgId: root.id,
      actor: instanceAdmin(),
      limit: 100,
      offset: 0
    });

    // Assert
    expect(result.organizations.map((org) => org.id)).toEqual([root.id, OTHER_ORG_ID]);
    expect(result.totalCount).toBe(2);
  });
});
