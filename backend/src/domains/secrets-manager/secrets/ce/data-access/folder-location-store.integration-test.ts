import { TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { FolderLocationStore } from "./folder-location-store";

describe("FolderLocationStore.findLocations", () => {
  const h = setupIntegration();

  // secret_folders belongs to Secret Manager but no domain owns it yet, so the test writes the rows directly.
  const folderTree = async () => {
    const tenant = await h.newTenant();
    const prod = tenant.environments.find((env) => env.slug === "prod")!;
    const [root] = await h.db(TableName.SecretFolder).insert({ name: "root", envId: prod.id }).returning("*");
    const [app] = await h
      .db(TableName.SecretFolder)
      .insert({ name: "app", envId: prod.id, parentId: root.id })
      .returning("*");
    const [db] = await h
      .db(TableName.SecretFolder)
      .insert({ name: "db", envId: prod.id, parentId: app.id })
      .returning("*");
    return { tenant, prod, root, app, db };
  };

  const store = () => new FolderLocationStore(poolStoreConnection(h.db));

  test("should give each folder its environment and full path, in the order asked", async () => {
    // Setup
    const { tenant, root, app, db } = await folderTree();

    // Action
    const locations = await store().findLocations(tenant.project.id, [db.id, root.id, app.id]);

    // Assert
    expect(locations).toEqual([
      { environmentSlug: "prod", secretPath: "/app/db" },
      { environmentSlug: "prod", secretPath: "/" },
      { environmentSlug: "prod", secretPath: "/app" }
    ]);
  });

  test("should give nothing for a folder in another project or in an environment being deleted", async () => {
    // Setup
    const { tenant, prod, app } = await folderTree();
    const other = await folderTree();
    await h.db(TableName.Environment).where({ id: prod.id }).update({ deleteAfter: new Date() });

    // Action
    const locations = await store().findLocations(tenant.project.id, [app.id, other.app.id]);

    // Assert
    expect(locations).toEqual([null, null]);
  });

  test("should give nothing for no folders without querying", async () => {
    // Setup
    const { tenant } = await folderTree();

    // Action
    const locations = await store().findLocations(tenant.project.id, []);

    // Assert
    expect(locations).toEqual([]);
  });
});
