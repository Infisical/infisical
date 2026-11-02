import { OrgMembershipRole, ProjectMembershipRole, SecretFolderRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { createFolder, deleteFolder } from "../../testUtils/folders";
import { createSecretV2 } from "../../testUtils/secrets";
import { addUserMembership, createUser, createUserAccessToken, deleteUsers } from "../../testUtils/users";

type TAccessibleSecret = {
  secretKey: string;
  secretValue: string;
  secretPath?: string;
  secretValueHidden: boolean;
};

const projectId = seedData1.projectV3.id;
const orgId = seedData1.organization.id;
const environmentSlug = seedData1.environment.slug;

const restrictedFolderName = `restricted-${alphaNumericNanoId(8).toLowerCase()}`;
const openFolderName = `open-${alphaNumericNanoId(8).toLowerCase()}`;
const restrictedSecret = { key: "ACCESSIBLE_RESTRICTED", value: `restricted-${alphaNumericNanoId(16)}` };
const openSecret = { key: "ACCESSIBLE_OPEN", value: `open-${alphaNumericNanoId(16)}` };

// A built-in Member can read every value in the environment. A list-tier folder access entry on the
// restricted folder takes read-value away there, and keeps describe.
describe("Dashboard accessible secrets", () => {
  const folders: { id: string }[] = [];
  let memberUserId: string;
  let memberToken: string;

  const getAccessibleSecrets = async (query: Record<string, string>) => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/dashboard/accessible-secrets",
      headers: { authorization: `Bearer ${memberToken}` },
      query: { projectId, environment: environmentSlug, ...query }
    });
    expect(res.statusCode).toBe(200);
    return { body: res.body, secrets: res.json<{ secrets: TAccessibleSecret[] }>().secrets };
  };

  beforeAll(async () => {
    for await (const [name, secret] of [
      [restrictedFolderName, restrictedSecret],
      [openFolderName, openSecret]
    ] as const) {
      folders.push(
        await createFolder({ workspaceId: projectId, environmentSlug, secretPath: "/", name, authToken: jwtAuthToken })
      );
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug,
        secretPath: `/${name}`,
        key: secret.key,
        value: secret.value,
        authToken: jwtAuthToken
      });
    }

    ({ userId: memberUserId } = await createUser("accessible-secrets"));
    await addUserMembership({ userId: memberUserId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId: memberUserId, orgId, projectId, role: ProjectMembershipRole.Member });
    memberToken = await createUserAccessToken({ userId: memberUserId, orgId });

    const grantRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/users/${memberUserId}/secret-folder-access`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { environmentSlug, secretPath: `/${restrictedFolderName}`, permission: SecretFolderRole.List }
    });
    expect(grantRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    await deleteUsers([memberUserId]);
    for await (const folder of folders) {
      await deleteFolder({
        workspaceId: projectId,
        environmentSlug,
        secretPath: "/",
        id: folder.id,
        authToken: jwtAuthToken,
        forceDelete: true
      });
    }
  });

  test("leaves out a value the actor cannot read when the restricted folder is requested directly", async () => {
    const { body, secrets } = await getAccessibleSecrets({ secretPath: `/${restrictedFolderName}` });

    expect(secrets).toEqual([]);
    expect(body).not.toContain(restrictedSecret.value);
  });

  test("masks the value when describe is requested for the restricted folder", async () => {
    const { body, secrets } = await getAccessibleSecrets({
      secretPath: `/${restrictedFolderName}`,
      filterByAction: "describeSecret"
    });

    expect(secrets).toEqual([
      expect.objectContaining({
        secretKey: restrictedSecret.key,
        secretPath: `/${restrictedFolderName}`,
        secretValueHidden: true
      })
    ]);
    expect(body).not.toContain(restrictedSecret.value);
  });

  test("returns the value and the absolute path for a folder the actor can read", async () => {
    const { secrets } = await getAccessibleSecrets({ secretPath: `/${openFolderName}` });

    expect(secrets).toEqual([
      expect.objectContaining({
        secretKey: openSecret.key,
        secretValue: openSecret.value,
        secretPath: `/${openFolderName}`,
        secretValueHidden: false
      })
    ]);
  });

  test("applies the folder restriction in recursive mode", async () => {
    const { body, secrets } = await getAccessibleSecrets({ secretPath: "/", recursive: "true" });

    expect(body).not.toContain(restrictedSecret.value);
    expect(secrets).toContainEqual(
      expect.objectContaining({
        secretKey: openSecret.key,
        secretValue: openSecret.value,
        secretPath: `/${openFolderName}`
      })
    );
  });
});
