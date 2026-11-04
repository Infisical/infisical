import { overrideLicenseFeatures } from "e2e-test/testUtils/license";
import qs from "qs";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

type TImportedBy = {
  environment: { name: string; slug: string };
  project?: { name: string; slug: string; id: string };
  folders: { name: string; isImported: boolean }[];
};

const headers = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const getImportedBy = async (environment: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/dashboard/secrets-overview?${qs.stringify({
      projectId: seedData1.projectV3.id,
      environments: environment,
      secretPath: "/",
      includeSecrets: true
    })}`,
    headers: headers()
  });
  expect(res.statusCode, res.payload).toBe(200);
  const { importedByEnvs } = res.json() as { importedByEnvs: { environment: string; importedBy: TImportedBy[] }[] };
  return importedByEnvs.find((el) => el.environment === environment)?.importedBy ?? [];
};

describe("Dashboard secrets overview imported-by", () => {
  let restoreLicense: () => void;
  let originalCrossProjectSharing: boolean;
  let importingProject: { id: string; name: string; slug: string };
  let sameProjectImportId: string;

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ crossProjectSecretSharing: true });

    const org = await testDb(TableName.Organization).where({ id: seedData1.organization.id }).first();
    originalCrossProjectSharing = Boolean(org?.allowCrossProjectSecretSharing);
    await testDb(TableName.Organization)
      .where({ id: seedData1.organization.id })
      .update({ allowCrossProjectSecretSharing: true });

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: headers(),
      body: { projectName: `e2e-imported-by-${crypto.randomUUID()}` }
    });
    expect(projectRes.statusCode).toBe(200);
    importingProject = projectRes.json().project;

    const envRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/workspace/${importingProject.id}/environments`,
      headers: headers(),
      body: { name: "Bug Test", slug: "bug-test" }
    });
    expect(envRes.statusCode).toBe(200);

    const grantRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/project-folder-grants",
      headers: headers(),
      body: {
        sourceProjectId: seedData1.projectV3.id,
        environment: "dev",
        secretPath: "/",
        targetProjectId: importingProject.id
      }
    });
    expect(grantRes.statusCode).toBe(200);

    const crossProjectImportRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/secret-imports",
      headers: headers(),
      body: {
        projectId: importingProject.id,
        environment: "bug-test",
        path: "/",
        import: { sourceProjectId: seedData1.projectV3.id, environment: "dev", path: "/" }
      }
    });
    expect(crossProjectImportRes.statusCode).toBe(200);

    const sameProjectImportRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/secret-imports",
      headers: headers(),
      body: {
        projectId: seedData1.projectV3.id,
        environment: "staging",
        path: "/",
        import: { environment: "dev", path: "/" }
      }
    });
    expect(sameProjectImportRes.statusCode).toBe(200);
    sameProjectImportId = sameProjectImportRes.json().secretImport.id;
  });

  afterAll(async () => {
    await testServer.inject({
      method: "DELETE",
      url: `/api/v2/secret-imports/${sameProjectImportId}`,
      headers: headers(),
      body: { projectId: seedData1.projectV3.id, environment: "staging", path: "/" }
    });
    await testServer.inject({ method: "DELETE", url: `/api/v1/projects/${importingProject.id}`, headers: headers() });
    await testDb(TableName.Organization)
      .where({ id: seedData1.organization.id })
      .update({ allowCrossProjectSecretSharing: originalCrossProjectSharing });
    restoreLicense();
  });

  test("lists an importer from another project whose environment the source project does not have", async () => {
    const importedBy = await getImportedBy("dev");

    expect(importedBy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          environment: { name: "Bug Test", slug: "bug-test" },
          project: { id: importingProject.id, name: importingProject.name, slug: importingProject.slug },
          folders: [expect.objectContaining({ name: "/", isImported: true })]
        })
      ])
    );
  });

  test("lists a same-project importer without a project", async () => {
    const importedBy = await getImportedBy("dev");

    const staging = importedBy.find((el) => el.environment.slug === "staging");
    expect(staging).toBeDefined();
    expect(staging).not.toHaveProperty("project");
    expect(staging!.folders).toEqual([expect.objectContaining({ name: "/", isImported: true })]);
  });
});
