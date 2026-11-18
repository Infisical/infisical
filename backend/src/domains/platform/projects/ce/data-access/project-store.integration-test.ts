import { ProjectType } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { ProjectsModule } from "../module";

describe("ProjectsService workspaces for License", () => {
  const h = setupIntegration();

  const build = () => ({ projects: new ProjectsModule({ db: h.db }).projectsService });

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
  };

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
    const { projects } = build();

    // Action
    const used = await projects.countWorkspaces(root.id);

    // Assert
    expect(used).toBe(2);
  });
});
