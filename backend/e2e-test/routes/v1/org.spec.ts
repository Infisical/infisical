import { seedData1 } from "@app/db/seed-data";

describe("Org V1 Router", async () => {
  test("GET Org list", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/organization",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("organizations");
    expect(payload).toEqual({
      organizations: [expect.objectContaining({ name: seedData1.organization.name })]
    });
  });
});
