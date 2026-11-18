import { randomUUID } from "node:crypto";

import { Knex } from "knex";

import { poolStoreConnection, ReadFrom } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";

import { OrganizationsModule } from "../module";
import { OrganizationStore } from "./organization-store";

describe("OrganizationsService organizations for License", () => {
  const h = setupIntegration();

  const build = () => ({
    organizations: new OrganizationsModule({ db: h.db, ...accessControlServices(h.db) }).organizationsService
  });

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

  test("should read the primary and not the replica when asked for the primary", async () => {
    // Setup
    const { root } = await orgTree();
    const store = new OrganizationStore(
      poolStoreConnection(h.db, () => {
        throw new Error("replica used");
      })
    );

    // Action
    const found = await store.findById(root.id, { readFrom: ReadFrom.Primary });

    // Assert
    expect(found?.id).toBe(root.id);
  });

  test("should read the replica by default", async () => {
    // Setup
    const { root } = await orgTree();
    const replica = vi.fn(() => h.db as Knex);
    const store = new OrganizationStore(poolStoreConnection(h.db, replica));

    // Action
    const found = await store.findById(root.id);

    // Assert
    expect(found?.id).toBe(root.id);
    expect(replica).toHaveBeenCalled();
  });
});

describe("OrganizationStore.findActorOrg", () => {
  const h = setupIntegration();

  const store = () => new OrganizationStore(poolStoreConnection(h.db));

  test("should give a sub-org its root org's sign-in policy", async () => {
    // Setup
    const root = await h.factories.organization({
      authEnforced: true,
      googleSsoAuthEnforced: false,
      bypassOrgAuthEnabled: true
    });
    const sub = await h.factories.organization({
      rootOrgId: root.id,
      parentOrgId: root.id,
      authEnforced: false,
      googleSsoAuthEnforced: true,
      bypassOrgAuthEnabled: false
    });

    // Action
    const found = await store().findActorOrg(sub.id);

    // Assert
    expect(found).toEqual({
      id: sub.id,
      name: sub.name,
      rootOrgId: root.id,
      parentOrgId: root.id,
      shouldUseNewPrivilegeSystem: Boolean(sub.shouldUseNewPrivilegeSystem),
      ssoPolicy: { authEnforced: true, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: true }
    });
  });

  test("should give a root org itself as its root and parent, with its own policy", async () => {
    // Setup
    const root = await h.factories.organization({ googleSsoAuthEnforced: true });

    // Action
    const found = await store().findActorOrg(root.id);

    // Assert
    expect(found).toMatchObject({
      id: root.id,
      rootOrgId: root.id,
      parentOrgId: root.id,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: true, bypassOrgAuthEnabled: false }
    });
  });

  test("should find nothing for an org that does not exist", async () => {
    // Action
    const found = await store().findActorOrg(randomUUID());

    // Assert
    expect(found).toBeNull();
  });
});
