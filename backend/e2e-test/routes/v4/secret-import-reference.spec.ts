import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { request } from "e2e-test/testUtils/request";
import { createSecretImport, deleteSecretImport } from "e2e-test/testUtils/secret-imports";
import { createSecretV2, deleteSecretV2 } from "e2e-test/testUtils/secrets";

import { seedData1 } from "@app/db/seed-data";

type TListSecretsV4Payload = {
  imports: {
    secretPath: string;
    environment: string;
    secrets: { secretKey: string; secretValue: string }[];
  }[];
};

describe("Relative secret import references", () => {
  const projectId = seedData1.projectV3.id;
  const currentEnv = seedData1.environment.slug;

  const createdSecrets: Parameters<typeof deleteSecretV2>[0][] = [];
  const createdImports: Parameters<typeof deleteSecretImport>[0][] = [];

  const createTrackedSecret = async (dto: Parameters<typeof createSecretV2>[0]) => {
    await createSecretV2(dto);
    createdSecrets.push(dto);
  };

  afterEach(async () => {
    const imports = createdImports.splice(0);
    const secrets = createdSecrets.splice(0);
    await Promise.all(imports.map((el) => deleteSecretImport(el)));
    await Promise.all(secrets.map((el) => deleteSecretV2(el)));
  });

  beforeAll(async () => {
    const appFolder = await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/",
      name: "app"
    });
    const sharedFolder = await createFolder({
      authToken: jwtAuthToken,
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/",
      name: "shared"
    });

    return async () => {
      await Promise.all(
        [appFolder, sharedFolder].map((folder) =>
          deleteFolder({
            authToken: jwtAuthToken,
            secretPath: "/",
            id: folder.id,
            workspaceId: projectId,
            environmentSlug: "prod"
          })
        )
      );
    };
  });

  test("Imported secret referencing a missing key keeps it literal and expands the rest", async () => {
    await createTrackedSecret({
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/shared",
      authToken: jwtAuthToken,
      key: "DB_HOST",
      value: "db.internal"
    });
    await createTrackedSecret({
      environmentSlug: "prod",
      workspaceId: projectId,
      secretPath: "/app",
      authToken: jwtAuthToken,
      key: "DATABASE_URL",
      value: `\${prod.shared.DB_HOST} \${NOT_IN_INFISICAL}`
    });

    const importDto = {
      environmentSlug: currentEnv,
      workspaceId: projectId,
      secretPath: "/",
      authToken: jwtAuthToken,
      importEnv: "prod",
      importPath: "/app"
    };
    const secretImport = await createSecretImport(importDto);
    createdImports.push({ ...importDto, id: secretImport.id });

    const payload = await request(
      {
        method: "GET",
        url: "/api/v4/secrets",
        headers: { authorization: `Bearer ${jwtAuthToken}` },
        query: {
          projectId,
          environment: currentEnv,
          secretPath: "/",
          expandSecretReferences: "true",
          includeImports: "true"
        }
      },
      (res) => {
        expect(res.statusCode).toBe(200);
        return res.json<TListSecretsV4Payload>();
      }
    );

    const imported = payload.imports.find((el) => el.environment === "prod" && el.secretPath === "/app");
    expect(imported?.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ secretKey: "DATABASE_URL", secretValue: `db.internal \${NOT_IN_INFISICAL}` })
      ])
    );
  });
});
