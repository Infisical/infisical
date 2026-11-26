import { unpackRules } from "@casl/ability/extra";

import { OrgMembershipRole, ProjectMembershipRole, SecretFolderRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";

import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;

// The member's role grants no secret access, so whatever it can see comes from its folder grant.
describe("Project permission checks that count a member's folder grants", () => {
  let userId: string;
  let memberToken: string;
  let folderId: string;

  beforeAll(async () => {
    ({ userId } = await createUser("folder-grant-member"));
    await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.NoAccess });
    memberToken = await createUserAccessToken({ userId, orgId });

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/folders",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectId, environment: seedData1.environment.slug, path: "/", name: "granted-folder" }
    });
    expect(res.statusCode, res.payload).toBe(200);
    folderId = res.json().folder.id;

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-grant-member",
      actorUserId: userId,
      projectId,
      folderId,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });
  });

  afterAll(async () => {
    await testDb(TableName.AdditionalPrivilege).where({ actorUserId: userId }).delete();
    await testServer.inject({
      method: "DELETE",
      url: `/api/v2/folders/${folderId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectId, environment: seedData1.environment.slug, path: "/", forceDelete: true }
    });
    await deleteUsers([userId]);
  });

  test("should return the folder grant's rules with the member's own permissions, for the UI to gate on", async () => {
    // Action
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/permissions`,
      headers: { authorization: `Bearer ${memberToken}` }
    });

    // Assert
    expect(res.statusCode, res.payload).toBe(200);
    const rules = unpackRules(res.json().data.permissions) as {
      subject: string | string[];
      inverted?: boolean;
      conditions?: { secretPath?: unknown };
    }[];
    expect(
      rules.some(
        (rule) =>
          !rule.inverted &&
          [rule.subject].flat().includes(ProjectPermissionSub.Secrets) &&
          rule.conditions?.secretPath === "/granted-folder"
      )
    ).toBe(true);
  });

  test("should let a member whose secret access comes only from a folder grant read the upgrade status", async () => {
    // Action
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/upgrade/status`,
      headers: { authorization: `Bearer ${memberToken}` }
    });

    // Assert
    expect(res.statusCode, res.payload).toBe(200);
  });
});
