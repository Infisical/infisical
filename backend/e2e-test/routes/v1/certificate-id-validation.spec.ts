import { seedData1 } from "@app/db/seed-data";
import { ProjectType, TableName } from "@app/db/schemas";

describe("Certificate V1 Router id validation", async () => {
  let projectId: string;

  beforeAll(async () => {
    const [project] = await testDb(TableName.Project)
      .insert({
        name: "cert-id-validation-test",
        slug: "cert-id-validation-test",
        orgId: seedData1.organization.id,
        type: ProjectType.CertificateManager
      })
      .returning("id");
    projectId = project.id;
  });

  afterAll(async () => {
    await testDb(TableName.Project).where({ id: projectId }).delete();
  });

  test("GET certificate bundle with a serial number instead of a UUID returns 422, not 500", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/cert-manager/certificates/593dc307c91567e2b4f328402d47030588841ac0/bundle",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(422);
    const payload = JSON.parse(res.payload);
    expect(payload.error).toBe("ValidationFailure");
  });

  test("GET certificate bundle with a valid but unknown UUID returns 404", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/cert-manager/certificates/00000000-0000-0000-0000-000000000000/bundle",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toBe(404);
  });
});
