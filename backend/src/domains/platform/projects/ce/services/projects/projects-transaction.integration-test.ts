import { randomUUID } from "node:crypto";

import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";

import { buildProjectsModule } from "../../testing/projects-module";

// The limit checks project and identity create run on the caller's transaction (see ../../../AGENTS.md).
describe("ProjectsService.within", () => {
  const h = setupIntegration();

  const build = () => buildProjectsModule(h.db).projectsService;

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
  };

  const insertProject = (trx: Knex, orgId: string) => {
    const id = randomUUID();
    return trx(TableName.Project).insert({
      name: `project-${id}`,
      slug: `project-${id}`,
      type: ProjectType.SecretManager,
      orgId
    });
  };

  test("should let exactly one of several concurrent creates take the last workspace slot", async () => {
    // Setup
    const { root } = await orgTree();
    await h.factories.project({ orgId: root.id });
    const service = build();
    const workspaceLimit = 2;
    const creates = 5;
    // Without the lock every create counts before any inserts; with it, the others wait out this window.
    let counted = 0;
    let allCounted!: () => void;
    const everyoneCounted = new Promise<void>((resolve) => {
      allCounted = resolve;
    });
    const raceWindow = () =>
      Promise.race([
        everyoneCounted,
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        })
      ]);

    // Action
    const results = await Promise.allSettled(
      Array.from({ length: creates }, () =>
        h.db.transaction(async (trx) => {
          const used = await service.within(sealKnexTransaction(trx)).lockAndCountWorkspaces(root.id);
          counted += 1;
          if (counted === creates) allCounted();
          await raceWindow();
          if (used >= workspaceLimit) throw new Error("limit reached");
          await insertProject(trx, root.id);
        })
      )
    );

    // Assert
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await service.countWorkspaces(root.id)).toBe(workspaceLimit);
  });

  test("should count workspaces the caller's transaction already wrote", async () => {
    // Setup
    const { root } = await orgTree();
    const service = build();

    // Action
    const used = await h.db.transaction(async (trx) => {
      await insertProject(trx, root.id);
      await insertProject(trx, root.id);
      return service.within(sealKnexTransaction(trx)).lockAndCountWorkspaces(root.id);
    });

    // Assert
    expect(used).toBe(2);
  });
});
