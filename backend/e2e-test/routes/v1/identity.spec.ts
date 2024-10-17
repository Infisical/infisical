import { OrgMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

export const createIdentity = async (name: string, role: string) => {
  const createIdentityRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    body: {
      name,
      role,
      organizationId: seedData1.organization.id
    },
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(createIdentityRes.statusCode).toBe(200);
  return createIdentityRes.json().identity;
};

export const deleteIdentity = async (id: string) => {
  const deleteIdentityRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(deleteIdentityRes.statusCode).toBe(200);
  return deleteIdentityRes.json().identity;
};

describe("Identity v1", async () => {
  test("Create identity", async () => {
    const newIdentity = await createIdentity("mac1", OrgMembershipRole.Admin);
    expect(newIdentity.name).toBe("mac1");
    expect(newIdentity.authMethods).toEqual([]);

    await deleteIdentity(newIdentity.id);
  });

  test("Update identity", async () => {
    const newIdentity = await createIdentity("mac1", OrgMembershipRole.Admin);
    expect(newIdentity.name).toBe("mac1");
    expect(newIdentity.authMethods).toEqual([]);

    const updatedIdentity = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/identities/${newIdentity.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        name: "updated-mac-1",
        role: OrgMembershipRole.Member
      }
    });

    expect(updatedIdentity.statusCode).toBe(200);
    expect(updatedIdentity.json().identity.name).toBe("updated-mac-1");

    await deleteIdentity(newIdentity.id);
  });

  test("Delete Identity", async () => {
    const newIdentity = await createIdentity("mac1", OrgMembershipRole.Admin);

    const deletedIdentity = await deleteIdentity(newIdentity.id);
    expect(deletedIdentity.name).toBe("mac1");
  });
});
