import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { ProjectMembershipRole, SecretFolderRole } from "@app/db/schemas";
import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "@app/services/secret/secret-fns";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder } from "../../testUtils/folders";
import { addIdentityToProject, createIdentityActor, grantIdentityFolderAccess } from "../../testUtils/identities";
import { createSecretV2 } from "../../testUtils/secrets";

const environmentSlug = "dev";
const secretPath = "/describe-only";
const secretValue = "by-id-secret-value";

const getSecretById = (dto: { url: string; authToken: string; viewSecretValue?: string }) =>
  testServer.inject({
    method: "GET",
    url: dto.url,
    headers: { authorization: `Bearer ${dto.authToken}` },
    query: dto.viewSecretValue === undefined ? undefined : { viewSecretValue: dto.viewSecretValue }
  });

describe.each([
  { version: "v4", url: (secretId: string) => `/api/v4/secrets/id/${secretId}` },
  { version: "v3", url: (secretId: string) => `/api/v3/secrets/raw/id/${secretId}` }
])("Get secret by ID ($version)", ({ url }) => {
  let adminToken: string;
  let describeOnlyToken: string;
  let secretId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const isolated = await createIsolatedOrgAndProject("secret-by-id");
    adminToken = isolated.authToken;
    cleanup = isolated.cleanup;

    await createFolder({
      workspaceId: isolated.projectId,
      environmentSlug,
      secretPath: "/",
      name: secretPath.slice(1),
      authToken: adminToken
    });

    const secret = await createSecretV2({
      workspaceId: isolated.projectId,
      environmentSlug,
      secretPath,
      key: "BY_ID_SECRET",
      value: secretValue,
      authToken: adminToken
    });
    secretId = secret.id;

    const identity = await createIdentityActor({ orgId: isolated.orgId, authToken: adminToken });
    describeOnlyToken = identity.authToken;
    await addIdentityToProject({
      projectId: isolated.projectId,
      identityId: identity.identityId,
      role: ProjectMembershipRole.NoAccess,
      authToken: adminToken
    });
    await grantIdentityFolderAccess({
      projectId: isolated.projectId,
      identityId: identity.identityId,
      environmentSlug,
      secretPath,
      permission: SecretFolderRole.List,
      authToken: adminToken
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  test("returns the value by default to an actor who can read it", async () => {
    const res = await getSecretById({ url: url(secretId), authToken: adminToken });
    expect(res.statusCode).toBe(200);
    expect(res.json().secret).toMatchObject({ id: secretId, secretValue, secretValueHidden: false });
  });

  test("refuses the value to an actor who can only describe the secret", async () => {
    const res = await getSecretById({ url: url(secretId), authToken: describeOnlyToken });
    expect(res.statusCode).toBe(403);
  });

  test("returns the secret with a hidden value when viewSecretValue is false", async () => {
    const res = await getSecretById({ url: url(secretId), authToken: describeOnlyToken, viewSecretValue: "false" });
    expect(res.statusCode).toBe(200);
    expect(res.json().secret).toMatchObject({
      id: secretId,
      secretKey: "BY_ID_SECRET",
      secretPath,
      environment: environmentSlug,
      secretValue: INFISICAL_SECRET_VALUE_HIDDEN_MASK,
      secretValueHidden: true
    });
  });
});
