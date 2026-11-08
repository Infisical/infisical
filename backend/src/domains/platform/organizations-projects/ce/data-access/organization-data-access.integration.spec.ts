import { randomUUID } from "node:crypto";

import { ProjectType, TableName } from "@app/db/schemas";
import { sealKnexTransaction } from "@app/domains/lib/legacy-transaction";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { FakeLicenseRegistry } from "@app/domains/platform/license/ce/testing/fake-license-registry";

import { OrganizationsProjectsModule } from "../module";

describe("OrganizationsProjectsModule organizations for License", () => {
  const h = setupIntegration();

  const build = () => {
    const license = new FakeLicenseRegistry();
    const module = new OrganizationsProjectsModule({ db: h.db, license });
    return { module, organizations: license.organizations! };
  };

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
  };

  test("should find a sub-org's root, and a root org itself, with its name and slug", async () => {
    // Setup
    const { root, sub } = await orgTree();
    const { organizations } = build();

    // Action
    const found = await Promise.all([organizations.findRootOrg(sub.id), organizations.findRootOrg(root.id)]);

    // Assert
    const expected = { id: root.id, name: root.name, slug: root.slug };
    expect(found).toEqual([expected, expected]);
  });

  test("should find no root for an org that does not exist", async () => {
    // Setup
    const { organizations } = build();

    // Action
    const found = await organizations.findRootOrg(randomUUID());

    // Assert
    expect(found).toBeNull();
  });

  test("should count live workspaces across the org tree, leaving out products that take no workspace slot", async () => {
    // Setup
    const { root, sub } = await orgTree();
    await h.factories.project({ orgId: root.id, type: ProjectType.SecretManager });
    await h.factories.project({ orgId: sub.id, type: ProjectType.KMS });
    await h.factories.project({ orgId: root.id, type: ProjectType.SecretManager, deleteAfter: new Date() });
    await Promise.all(
      [ProjectType.CertificateManager, ProjectType.SecretScanning, ProjectType.PAM, ProjectType.AgentVault].map(
        (type) => h.factories.project({ orgId: root.id, type })
      )
    );
    const { organizations } = build();

    // Action
    const used = await organizations.countWorkspacesUsed(root.id);

    // Assert
    expect(used).toBe(2);
  });

  test("should count a workspace the caller's transaction has written and not committed", async () => {
    // Setup
    const { root } = await orgTree();
    await h.factories.project({ orgId: root.id, type: ProjectType.SecretManager });
    const { module } = build();

    // Action
    const counts = await h.db.transaction(async (trx) => {
      await trx(TableName.Project).insert({
        name: `p-${randomUUID()}`,
        slug: `p-${randomUUID()}`,
        type: ProjectType.SecretManager,
        orgId: root.id
      });
      return {
        inside: await module.service.countWorkspaces(root.id, sealKnexTransaction(trx)),
        outside: await module.service.countWorkspaces(root.id)
      };
    });

    // Assert
    expect(counts).toEqual({ inside: 2, outside: 1 });
  });
});
