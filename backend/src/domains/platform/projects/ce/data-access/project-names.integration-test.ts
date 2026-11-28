import { randomUUID } from "node:crypto";

import { setupIntegration } from "@app/domains/lib/testing/integration";

import { buildProjectsModule } from "../testing/projects-module";

describe("ProjectsService.findProjectNames", () => {
  const h = setupIntegration();

  test("should name the projects asked for, skipping ones scheduled for deletion and ids that don't exist", async () => {
    // Setup
    const org = await h.factories.organization();
    const { project: live } = await h.factories.project({ orgId: org.id });
    const { project: deleted } = await h.factories.project({ orgId: org.id, deleteAfter: new Date() });
    await h.factories.project({ orgId: org.id });
    const { projectsService } = buildProjectsModule(h.db);

    // Action
    const names = await projectsService.findProjectNames([live.id, deleted.id, randomUUID()]);

    // Assert
    expect(names).toEqual([{ id: live.id, name: live.name, orgId: org.id }]);
  });

  test("should name nothing without asking the database when no ids are given", async () => {
    // Setup
    const { projectsService } = buildProjectsModule(h.db);

    // Action
    const names = await projectsService.findProjectNames([]);

    // Assert
    expect(names).toEqual([]);
  });
});
