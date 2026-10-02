import { randomUUID } from "node:crypto";

import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretV2, deleteSecretV2, getSecretsV2 } from "e2e-test/testUtils/secrets";
import jwt from "jsonwebtoken";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

describe("Secret Recursive Testing", async () => {
  const projectId = seedData1.projectV3.id;
  const folderAndSecretNames = [
    { name: "deep1", path: "/", expectedSecretCount: 4 },
    { name: "deep21", path: "/deep1", expectedSecretCount: 2 },
    { name: "deep3", path: "/deep1/deep2", expectedSecretCount: 1 },
    { name: "deep22", path: "/deep2", expectedSecretCount: 1 }
  ];

  // Top-level folder of every fixture path. Deleting these cascades to their
  // descendants, so they're the only ids cleanup needs.
  //
  // Some are created *implicitly*: `createFolder` auto-creates missing parents,
  // so asking for folder "deep22" at path "/deep2" also creates "/deep2" — and
  // that id is never returned to us. Deriving roots from the fixture paths
  // (rather than only recording folders created at "/") is what stops those
  // from being orphaned in the shared project's prod environment, where this
  // very spec asserts on exact recursive secret counts.
  const rootFolderNames = [
    ...new Set(folderAndSecretNames.map(({ name, path }) => (path === "/" ? name : path.split("/").filter(Boolean)[0])))
  ];

  beforeAll(async () => {
    const rootFolderIds: string[] = [];

    // Create the implicit roots up front so cleanup has an id for each. Roots a
    // fixture entry already creates at "/" are skipped — creating them twice
    // would fail on the duplicate name.
    const explicitRootNames = new Set(folderAndSecretNames.filter(({ path }) => path === "/").map(({ name }) => name));
    for (const name of rootFolderNames.filter((n) => !explicitRootNames.has(n))) {
      // eslint-disable-next-line no-await-in-loop
      const createdRoot = await createFolder({
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: "/",
        name
      });
      rootFolderIds.push(createdRoot.id);
    }

    for (const folder of folderAndSecretNames) {
      // eslint-disable-next-line no-await-in-loop
      const createdFolder = await createFolder({
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        secretPath: folder.path,
        name: folder.name
      });

      if (folder.path === "/") {
        rootFolderIds.push(createdFolder.id);
      }
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        secretPath: folder.path,
        authToken: jwtAuthToken,
        environmentSlug: "prod",
        workspaceId: projectId,
        key: folder.name,
        value: folder.name
      });
    }

    return async () => {
      await Promise.all(
        rootFolderIds.map((id) =>
          deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id,
            workspaceId: projectId,
            environmentSlug: "prod"
          })
        )
      );

      await Promise.all(
        folderAndSecretNames
          .filter(({ path }) => path === "/")
          .map(({ name }) =>
            deleteSecretV2({
              authToken: jwtAuthToken,
              secretPath: "/",
              workspaceId: projectId,
              environmentSlug: "prod",
              key: name
            })
          )
      );
    };
  });

  test.each(folderAndSecretNames)("$path recursive secret fetching", async ({ path, expectedSecretCount }) => {
    const secrets = await getSecretsV2({
      authToken: jwtAuthToken,
      secretPath: path,
      workspaceId: projectId,
      environmentSlug: "prod",
      recursive: true
    });

    expect(secrets.secrets.length).toEqual(expectedSecretCount);
    expect(secrets.secrets.sort((a, b) => a.secretKey.localeCompare(b.secretKey))).toEqual(
      folderAndSecretNames
        .filter((el) => el.path.startsWith(path))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((el) =>
          expect.objectContaining({
            secretKey: el.name,
            secretValue: el.name
          })
        )
    );
  });
});

const orgId = seedData1.organization.id;

const createNoAccessUser = async (projectId: string) => {
  const sessionId = randomUUID();
  const username = `rec-perm-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
    .returning("*");

  const [orgMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: user.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

  const [projectMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      scopeProjectId: projectId,
      actorUserId: user.id
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({
    membershipId: projectMembership.id,
    role: ProjectMembershipRole.NoAccess
  });

  await testDb(TableName.AuthTokenSession).insert({
    id: sessionId,
    userId: user.id,
    ip: "127.0.0.1",
    userAgent: "e2e-secret-recursive",
    accessVersion: 1,
    refreshVersion: 1,
    lastUsed: new Date()
  } as never);

  const jwtToken = jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: user.id,
      tokenVersionId: sessionId,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    process.env.AUTH_SECRET ?? "something-random",
    { expiresIn: 3600 }
  );

  return { userId: user.id, jwtToken, sessionId };
};

const deleteNoAccessUser = async (userId: string, sessionId: string) => {
  await testDb(TableName.AuthTokenSession).where({ id: sessionId }).del();
  await testDb(TableName.Membership).where({ actorUserId: userId }).del();
  await testDb(TableName.Users).where({ id: userId }).del();
};

describe("Secret recursive listing with nested-only permission", async () => {
  const projectId = seedData1.projectV3.id;
  const environmentSlug = seedData1.environment.slug;
  const folderAPath = "/rec-perm-a";
  const folderBPath = "/rec-perm-a/rec-perm-b";
  const secretInA = { key: "REC_PERM_A", value: "secret-in-a" };
  const secretInB = { key: "REC_PERM_B", value: "secret-in-b" };

  let folderAId: string;
  let grantedUser: { userId: string; jwtToken: string; sessionId: string };
  let noGrantUser: { userId: string; jwtToken: string; sessionId: string };

  beforeAll(async () => {
    const folderA = await createFolder({
      authToken: jwtAuthToken,
      environmentSlug,
      workspaceId: projectId,
      secretPath: "/",
      name: "rec-perm-a"
    });
    folderAId = folderA.id;

    await createFolder({
      authToken: jwtAuthToken,
      environmentSlug,
      workspaceId: projectId,
      secretPath: folderAPath,
      name: "rec-perm-b"
    });

    await createSecretV2({
      secretPath: folderAPath,
      authToken: jwtAuthToken,
      environmentSlug,
      workspaceId: projectId,
      key: secretInA.key,
      value: secretInA.value
    });
    await createSecretV2({
      secretPath: folderBPath,
      authToken: jwtAuthToken,
      environmentSlug,
      workspaceId: projectId,
      key: secretInB.key,
      value: secretInB.value
    });

    grantedUser = await createNoAccessUser(projectId);
    noGrantUser = await createNoAccessUser(projectId);

    const grantRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/users/${grantedUser.userId}/secret-folder-access`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: {
        environmentSlug,
        secretPath: folderBPath,
        permission: SecretFolderRole.Read
      }
    });
    expect(grantRes.statusCode).toBe(200);

    return async () => {
      await deleteFolder({
        authToken: jwtAuthToken,
        secretPath: "/",
        id: folderAId,
        workspaceId: projectId,
        environmentSlug
      });
      await deleteNoAccessUser(grantedUser.userId, grantedUser.sessionId);
      await deleteNoAccessUser(noGrantUser.userId, noGrantUser.sessionId);
    };
  });

  test("recursive list from /a returns only secrets the actor can read on /a/b", async () => {
    const payload = await getSecretsV2({
      authToken: grantedUser.jwtToken,
      secretPath: folderAPath,
      workspaceId: projectId,
      environmentSlug,
      recursive: true
    });

    expect(payload.secrets).toEqual([
      expect.objectContaining({
        secretKey: secretInB.key,
        secretValue: secretInB.value
      })
    ]);
  });

  test("recursive list from /a is forbidden when the actor has no describe permission", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets/raw`,
      headers: { authorization: `Bearer ${noGrantUser.jwtToken}` },
      query: {
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: folderAPath,
        recursive: "true"
      }
    });
    expect(res.statusCode).toBe(403);
  });
});
