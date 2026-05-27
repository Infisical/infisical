import type { APIRequestContext } from "@playwright/test";

import { env } from "./env";

export type ScimUser = {
  id: string;
  userName: string;
  emails: { primary: boolean; value: string }[];
  active: boolean;
};

const scimHeaders = () => ({
  Authorization: `Bearer ${env.scimToken}`,
  "Content-Type": "application/scim+json",
  Accept: "application/scim+json"
});

export const createScimUser = async (
  request: APIRequestContext,
  input: { externalId: string; email: string; firstName?: string; lastName?: string }
): Promise<ScimUser> => {
  const response = await request.post("/api/v1/scim/Users", {
    headers: scimHeaders(),
    data: {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: input.externalId,
      emails: [{ primary: true, value: input.email }],
      name: {
        givenName: input.firstName ?? "E2E",
        familyName: input.lastName ?? "Test"
      },
      active: true
    }
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`SCIM create user failed (${response.status()}): ${body}`);
  }

  return response.json() as Promise<ScimUser>;
};

export const findScimUserByExternalId = async (
  request: APIRequestContext,
  externalId: string
): Promise<ScimUser | null> => {
  const response = await request.get("/api/v1/scim/Users", {
    headers: scimHeaders(),
    params: {
      filter: `userName eq "${externalId}"`,
      count: "1"
    }
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`SCIM list users failed (${response.status()}): ${body}`);
  }

  const payload = (await response.json()) as { Resources: ScimUser[] };
  return payload.Resources[0] ?? null;
};

export const deleteScimUser = async (request: APIRequestContext, orgMembershipId: string): Promise<void> => {
  const response = await request.delete(`/api/v1/scim/Users/${orgMembershipId}`, {
    headers: scimHeaders()
  });

  if (!response.ok() && response.status() !== 404) {
    const body = await response.text();
    throw new Error(`SCIM delete user failed (${response.status()}): ${body}`);
  }
};

export const ensureScimUserAbsent = async (request: APIRequestContext, externalId: string): Promise<void> => {
  const existing = await findScimUserByExternalId(request, externalId);
  if (!existing) {
    return;
  }
  await deleteScimUser(request, existing.id);
};

// SCIM PATCH for {active: false} flips `memberships.isActive` on the gamma row
// (see scim-service.ts:681). Per RFC 7644 §3.5.2 a replace op without `path`
// accepts a value object — gamma's parser handles both shapes; the path form
// is more explicit and what most IdPs send.
export const setScimUserActive = async (
  request: APIRequestContext,
  orgMembershipId: string,
  active: boolean
): Promise<ScimUser> => {
  const response = await request.patch(`/api/v1/scim/Users/${orgMembershipId}`, {
    headers: scimHeaders(),
    data: {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: active }]
    }
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`SCIM patch active=${active} failed (${response.status()}): ${body}`);
  }

  return response.json() as Promise<ScimUser>;
};
