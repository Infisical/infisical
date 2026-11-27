import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";

import { createFolder, deleteFolder } from "../../testUtils/folders";
import { createIdentityActor } from "../../testUtils/identities";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;

// The token carries the name it was issued with, but {{identity.username}} has to follow a rename.
describe("{{identity.username}} after an identity is renamed", () => {
  let identityId: string;
  let identityToken: string;
  let roleId: string;
  const oldName = `billing-${randomUUID().slice(0, 8)}`;
  const newName = `payments-${randomUUID().slice(0, 8)}`;
  const folderIds: string[] = [];
  const environment = seedData1.environment.slug;

  beforeAll(async () => {
    ({ identityId, authToken: identityToken } = await createIdentityActor({
      orgId,
      authToken: jwtAuthToken,
      name: oldName
    }));
    const folders = await Promise.all(
      [oldName, newName].map((name) =>
        createFolder({
          workspaceId: projectId,
          environmentSlug: environment,
          secretPath: "/",
          name,
          authToken: jwtAuthToken
        })
      )
    );
    folderIds.push(...folders.map((folder) => folder.id));

    // Inserted directly since the e2e license mock refuses custom roles through the API.
    const slug = `by-name-${randomUUID().slice(0, 8)}`;
    const [role] = await testDb(TableName.Role)
      .insert({
        name: slug,
        slug,
        projectId,
        permissions: JSON.stringify(
          packRules([
            {
              action: ProjectPermissionSecretActions.ReadValue,
              subject: ProjectPermissionSub.Secrets,
              conditions: { secretPath: "/{{identity.username}}" }
            }
          ] as never)
        )
      })
      .returning("id");
    roleId = (role as { id: string }).id;
    const [membership] = await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Project, scopeOrgId: orgId, scopeProjectId: projectId, actorIdentityId: identityId })
      .returning("id");
    await testDb(TableName.MembershipRole).insert({
      membershipId: (membership as { id: string }).id,
      role: "custom",
      customRoleId: roleId
    });

    await testDb(TableName.Identity).where({ id: identityId }).update({ name: newName });
  });

  afterAll(async () => {
    await Promise.all(
      folderIds.map((id) =>
        deleteFolder({
          workspaceId: projectId,
          environmentSlug: environment,
          secretPath: "/",
          id,
          authToken: jwtAuthToken
        })
      )
    );
    await testDb(TableName.Membership).where({ actorIdentityId: identityId }).delete();
    await testDb(TableName.Identity).where({ id: identityId }).delete();
    await testDb(TableName.Role).where({ id: roleId }).delete();
  });

  const readSecretsAt = (secretPath: string) =>
    testServer.inject({
      method: "GET",
      url: "/api/v3/secrets/raw",
      query: { workspaceId: projectId, environment, secretPath },
      headers: { authorization: `Bearer ${identityToken}` }
    });

  test("should match the identity's current name, not the one its token was issued with", async () => {
    // Action
    const [atNewName, atOldName] = await Promise.all([readSecretsAt(`/${newName}`), readSecretsAt(`/${oldName}`)]);

    // Assert
    expect(atNewName.statusCode, atNewName.payload).toBe(200);
    expect(atOldName.statusCode, atOldName.payload).toBe(403);
  });
});
