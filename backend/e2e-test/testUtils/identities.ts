import { randomUUID } from "node:crypto";

import { OrgMembershipRole, ProjectMembershipRole, SecretFolderRole } from "@app/db/schemas";

// A machine identity is the actor to reach for when a spec needs a second, less privileged
// principal. A second *user* cannot be made over the API at all (the real path is invite, email,
// signup, accept), which is why specs that want one insert into users, memberships and
// auth_token_sessions and hand-sign a JWT. An identity needs none of that, and every route that
// takes AuthMode.JWT alongside AuthMode.IDENTITY_ACCESS_TOKEN cannot tell the difference.

export const createIdentityActor = async (dto: {
  orgId: string;
  authToken: string;
  role?: OrgMembershipRole;
  name?: string;
}) => {
  const name = dto.name ?? `e2e-identity-${randomUUID().slice(0, 8)}`;
  const headers = { authorization: `Bearer ${dto.authToken}` };

  const createRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    headers,
    body: { name, role: dto.role ?? OrgMembershipRole.Member, organizationId: dto.orgId }
  });
  expect(createRes.statusCode).toBe(200);
  const identityId = createRes.json().identity.id as string;

  // Every field on both bodies has a default, so the identity gets the standard 30-day token and
  // an unrestricted trusted-IP range without the spec having to say so.
  const attachRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identityId}`,
    headers,
    body: {}
  });
  expect(attachRes.statusCode).toBe(200);
  const clientId = attachRes.json().identityUniversalAuth.clientId as string;

  const clientSecretRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
    headers,
    body: {}
  });
  expect(clientSecretRes.statusCode).toBe(200);
  const { clientSecret } = clientSecretRes.json();

  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret }
  });
  expect(loginRes.statusCode).toBe(200);

  return { identityId, authToken: loginRes.json().accessToken as string };
};

export const addIdentityToProject = async (dto: {
  projectId: string;
  identityId: string;
  role: ProjectMembershipRole;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${dto.projectId}/memberships/identities/${dto.identityId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { roles: [{ role: dto.role }] }
  });

  expect(res.statusCode).toBe(200);
};

export const grantIdentityFolderAccess = async (dto: {
  projectId: string;
  identityId: string;
  environmentSlug: string;
  secretPath: string;
  permission: SecretFolderRole;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${dto.projectId}/memberships/identities/${dto.identityId}/secret-folder-access`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      environmentSlug: dto.environmentSlug,
      secretPath: dto.secretPath,
      permission: dto.permission
    }
  });

  expect(res.statusCode).toBe(200);
};
