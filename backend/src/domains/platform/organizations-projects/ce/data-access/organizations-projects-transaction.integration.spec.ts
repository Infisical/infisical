import { randomUUID } from "node:crypto";

import { Knex } from "knex";

import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { sealKnexTransaction } from "@app/domains/lib/legacy-transaction";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { OrganizationsProjectsModule } from "../module";

// The limit checks project and identity create run on the caller's transaction (see ../../AGENTS.md).
describe("OrganizationsProjectsService.within", () => {
  const h = setupIntegration();

  const build = () => new OrganizationsProjectsModule({ db: h.db }).service;

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

  const insertOrgIdentity = async (trx: Knex, orgId: string) => {
    const [identity] = await trx(TableName.Identity)
      .insert({ name: `identity-${randomUUID()}`, orgId })
      .returning("id");
    await trx(TableName.Membership).insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorIdentityId: (identity as { id: string }).id
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

  test("should make a concurrent seat count wait for the add holding the lock, then see it", async () => {
    // Setup
    const { root, sub } = await orgTree();
    const service = build();
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });
    let secondCounted = false;

    // Action
    const first = h.db.transaction(async (trx) => {
      await service.within(sealKnexTransaction(trx)).lockAndCountBillableOrgActors(root.id);
      firstLocked();
      await firstHolds;
      await insertOrgIdentity(trx, sub.id);
    });
    await locked;
    const second = h.db
      .transaction(async (trx) => service.within(sealKnexTransaction(trx)).lockAndCountBillableOrgActors(sub.id))
      .then((counts) => {
        secondCounted = true;
        return counts;
      });
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    const countedWhileLocked = secondCounted;
    releaseFirst();
    const [, counts] = await Promise.all([first, second]);

    // Assert
    expect(countedWhileLocked).toBe(false);
    expect(counts).toEqual({ users: 0, identities: 1 });
  });

  test("should return no seat count for an org that does not exist", async () => {
    // Setup
    const service = build();

    // Action
    const counts = await h.db.transaction(async (trx) =>
      service.within(sealKnexTransaction(trx)).lockAndCountBillableOrgActors(randomUUID())
    );

    // Assert
    expect(counts).toBeNull();
  });
});
