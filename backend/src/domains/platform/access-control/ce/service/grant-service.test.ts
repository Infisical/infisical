import crypto from "node:crypto";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { ActorType } from "@app/lib/auth/actor-types";

import { PermissionCache } from "../data-access/permission-cache";
import { InMemoryAccessControlDataAccess } from "../testing/in-memory-access-control-data-access";
import { GrantService } from "./grant-service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const setup = () => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const keyStore = new InMemoryKeyStore(() => clock);
  const store = new InMemoryAccessControlDataAccess();
  const service = new GrantService({ dataAccess: store.dataAccess, cache: new PermissionCache(keyStore) });
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const addMembership = (role: string) =>
    store.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: userId,
        roles: [{ role }]
      })
    );
  return {
    service,
    store,
    addMembership,
    advance: (ms: number) => {
      clock += ms;
    },
    input: (compute: () => Promise<string>) => ({
      key: "test",
      actor: { type: ActorType.USER as const, id: userId },
      scope: { orgId, projectId },
      compute
    })
  };
};

describe("GrantService.withCache", () => {
  test("should serve the cached value while the marker is fresh", async () => {
    // Setup
    const { service, addMembership, input } = setup();
    await addMembership(ProjectMembershipRole.Member);
    let computed = 0;
    const compute = async () => {
      computed += 1;
      return `v${computed}`;
    };
    await service.withCache(input(compute));

    // Action
    const second = await service.withCache(input(compute));

    // Assert
    expect(second).toBe("v1");
    expect(computed).toBe(1);
  });

  test("should recompute once the grants it was built from change", async () => {
    // Setup
    const { service, store, addMembership, advance, input } = setup();
    const membership = await addMembership(ProjectMembershipRole.Member);
    let computed = 0;
    const compute = async () => {
      computed += 1;
      return `v${computed}`;
    };
    const before = await service.withCache(input(compute));

    // Action
    await store.transactionRunner.run(({ dataAccess }) => dataAccess.memberships.deleteByIds([membership.id]));
    advance(11_000);
    const after = await service.withCache(input(compute));

    // Assert
    expect(before).toBe("v1");
    expect(after).toBe("v2");
  });

  test("should recompute after the named version it folds in is bumped", async () => {
    // Setup
    const { service, addMembership, advance, input } = setup();
    await addMembership(ProjectMembershipRole.Member);
    let computed = 0;
    const compute = async () => {
      computed += 1;
      return `v${computed}`;
    };
    const withVersion = () => ({
      ...input(compute),
      extraFingerprint: async () => String(await service.version("tree"))
    });
    await service.withCache(withVersion());

    // Action
    await service.invalidate("tree");
    advance(11_000);
    const after = await service.withCache(withVersion());

    // Assert
    expect(after).toBe("v2");
  });
});
