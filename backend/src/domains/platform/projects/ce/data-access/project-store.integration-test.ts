import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { buildProjectsModule } from "../testing/projects-module";
import { ProjectStore } from "./project-store";

describe("ProjectsService workspaces for License", () => {
  const h = setupIntegration();

  const build = () => ({ projects: buildProjectsModule(h.db).projectsService });

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

describe("ProjectStore.findById", () => {
  const h = setupIntegration();

  const store = () => new ProjectStore(poolStoreConnection(h.db));

  test("should read the project facts a permission check needs", async () => {
    // Setup
    const org = await h.factories.organization();
    const { project } = await h.factories.project({
      orgId: org.id,
      type: ProjectType.KMS,
      enforceEncryptedSecretManagerSecretMetadata: true
    });

    // Action
    const found = await store().findById(project.id);

    // Assert
    expect(found?.toJSON()).toEqual({
      id: project.id,
      name: project.name,
      slug: project.slug,
      orgId: org.id,
      type: ProjectType.KMS,
      enforceEncryptedSecretManagerSecretMetadata: true
    });
  });

  test("should find nothing for a project that does not exist", async () => {
    // Action
    const found = await store().findById(randomUUID());

    // Assert
    expect(found).toBeNull();
  });
});

describe("ProjectStore.findDeletionState", () => {
  const h = setupIntegration();

  const store = () => new ProjectStore(poolStoreConnection(h.db));

  test("should give when a project is scheduled for deletion, and nothing for a live or missing one", async () => {
    // Setup
    const org = await h.factories.organization();
    const deleteAfter = new Date("2030-01-02T03:04:05.000Z");
    const { project: scheduled } = await h.factories.project({ orgId: org.id, deleteAfter });
    const { project: live } = await h.factories.project({ orgId: org.id });

    // Action
    const states = await Promise.all(
      [scheduled.id, live.id, randomUUID()].map((projectId) => store().findDeletionState(projectId))
    );

    // Assert
    expect(states).toEqual([deleteAfter.toISOString(), "", ""]);
  });
});
