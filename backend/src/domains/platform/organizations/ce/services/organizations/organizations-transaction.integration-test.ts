import { randomUUID } from "node:crypto";

import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";

import { OrganizationsModule } from "../../module";

// The limit checks project and identity create run on the caller's transaction (see ../../../AGENTS.md).
describe("OrganizationsService.within", () => {
  const h = setupIntegration();

  const build = () => new OrganizationsModule({ db: h.db }).organizationsService;

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    return { root, sub };
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
