import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { FolderPathDataAccess } from "./folder-path-data-access";

describe("FolderPathDataAccess.findLocations", () => {
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

  test("should give each folder its environment and full path, in the order asked", async () => {
    // Setup
    const { tenant, root, db } = await folderTree();
    const folders = new FolderPathDataAccess(DataAccessDb.fromClient(h.db));

    // Action
    const locations = await folders.findLocations(tenant.project.id, [db.id, root.id]);

    // Assert
    expect(locations).toEqual([
      { environmentSlug: "prod", path: "/app/db" },
      { environmentSlug: "prod", path: "/" }
    ]);
  });

  test("should give nothing for a folder in another project or in an environment being deleted", async () => {
    // Setup
    const { tenant, prod, app } = await folderTree();
    const other = await folderTree();
    const folders = new FolderPathDataAccess(DataAccessDb.fromClient(h.db));
    await h.db(TableName.Environment).where({ id: prod.id }).update({ deleteAfter: new Date() });

    // Action
    const locations = await folders.findLocations(tenant.project.id, [app.id, other.app.id]);

    // Assert
    expect(locations).toEqual([undefined, undefined]);
  });
});
