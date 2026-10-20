import jwt from "jsonwebtoken";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretType,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const projectId = seedData1.projectV3.id;
const orgId = seedData1.organization.id;
const environment = seedData1.environment.slug;

const SHARED_VALUE = "shared-value";
const PERSONAL_VALUE = "owner-personal-override-value";

const secretKey = `PERSONAL_VERSION_${alphaNumericNanoId(8).toUpperCase()}`;

const ownerHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

let viewerUserId: string;
let viewerSessionId: string;
let viewerJwt: string;
let personalSecretId: string;
let sharedSecretId: string;

const viewerHeaders = () => ({ authorization: `Bearer ${viewerJwt}` });

const createSecret = async (type: SecretType, secretValue: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${secretKey}`,
    headers: ownerHeaders(),
    body: {
      workspaceId: projectId,
      environment,
      secretPath: "/",
      type,
      secretValue
    }
  });
  expect(res.statusCode).toBe(200);
};

const createViewerUser = async () => {
  const username = `personal-version-viewer-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
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
    role: ProjectMembershipRole.Viewer
  });

  const [session] = await testDb(TableName.AuthTokenSession)
    .insert({
      userId: user.id,
      ip: "127.0.0.1",
      userAgent: "e2e-personal-version-access",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("*");

  initLogger();
  await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

  return {
    userId: user.id,
    sessionId: session.id,
    token: jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: session.id,
        authMethod: AuthMethod.EMAIL,
        organizationId: orgId,
        accessVersion: 1
      },
      getConfig().AUTH_SECRET,
      { expiresIn: 3600 }
    )
  };
};

describe("Personal secret override version access", () => {
  beforeAll(async () => {
    await createSecret(SecretType.Shared, SHARED_VALUE);
    await createSecret(SecretType.Personal, PERSONAL_VALUE);

    const secrets = await testDb(TableName.SecretV2).where({ key: secretKey });
    personalSecretId = secrets.find((el) => el.type === SecretType.Personal)!.id;
    sharedSecretId = secrets.find((el) => el.type === SecretType.Shared)!.id;

    const viewer = await createViewerUser();
    viewerUserId = viewer.userId;
    viewerSessionId = viewer.sessionId;
    viewerJwt = viewer.token;
  });

  afterAll(async () => {
    await testDb(TableName.AuthTokenSession).where({ id: viewerSessionId }).del();
    await testDb(TableName.Membership).where({ actorUserId: viewerUserId }).del();
    await testDb(TableName.Users).where({ id: viewerUserId }).del();

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v3/secrets/raw/${secretKey}`,
      headers: ownerHeaders(),
      body: { workspaceId: projectId, environment, secretPath: "/" }
    });
    expect(res.statusCode).toBe(200);
  });

  test("another project user cannot list versions of someone else's personal override", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/dashboard/secret-versions/${personalSecretId}?offset=0&limit=20`,
      headers: viewerHeaders()
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain(PERSONAL_VALUE);
  });

  test("another project user cannot read a version value of someone else's personal override", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/dashboard/secret-versions/${personalSecretId}/value/1`,
      headers: viewerHeaders()
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain(PERSONAL_VALUE);
  });

  test("another project user cannot reach the personal override through the EE versions route", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret/${personalSecretId}/secret-versions?offset=0&limit=20`,
      headers: viewerHeaders()
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain(PERSONAL_VALUE);
  });

  test("the owner can still read their own personal override version value", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/dashboard/secret-versions/${personalSecretId}/value/1`,
      headers: ownerHeaders()
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe(PERSONAL_VALUE);
  });

  test("shared secret versions remain readable by another project user", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/dashboard/secret-versions/${sharedSecretId}?offset=0&limit=20`,
      headers: viewerHeaders()
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().secretVersions).toEqual(
      expect.arrayContaining([expect.objectContaining({ secretKey, version: 1 })])
    );
  });
});
