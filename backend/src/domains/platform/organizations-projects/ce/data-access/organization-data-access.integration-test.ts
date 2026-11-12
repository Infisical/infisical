import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { OrganizationsProjectsModule } from "../module";

describe("OrganizationsProjectsService organizations for License", () => {
  const h = setupIntegration();

  const build = () => ({ organizations: new OrganizationsProjectsModule({ db: h.db }).service });

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
  };

  test("should find a sub-org's root, and a root org itself", async () => {
    // Setup
    const { root, sub } = await orgTree();
    const { organizations } = build();

    // Action
    const found = await Promise.all([organizations.findRootOrgId(sub.id), organizations.findRootOrgId(root.id)]);

    // Assert
    expect(found).toEqual([root.id, root.id]);
  });

  test("should find no root for an org that does not exist", async () => {
    // Setup
    const { organizations } = build();

    // Action
    const found = await organizations.findRootOrgId(randomUUID());

    // Assert
    expect(found).toBeNull();
  });

  test("should read an org's name and slug, and nothing for an org that does not exist", async () => {
    // Setup
    const { root } = await orgTree();
    const { organizations } = build();

    // Action
    const found = await Promise.all([
      organizations.findOrganization(root.id),
      organizations.findOrganization(randomUUID())
    ]);

    // Assert
    expect(found).toEqual([{ id: root.id, name: root.name, slug: root.slug }, null]);
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
    const used = await organizations.countWorkspaces(root.id);

    // Assert
    expect(used).toBe(2);
  });
});
