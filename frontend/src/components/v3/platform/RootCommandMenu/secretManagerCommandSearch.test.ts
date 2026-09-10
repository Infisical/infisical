import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TDashboardProjectSecretsQuickSearch } from "@app/hooks/api/dashboard/types";
import type { ProjectEnv } from "@app/hooks/api/projects/types";

import { buildSecretManagerCommandMatches } from "./secretManagerCommandSearch";

const environments = [
  { id: "env-prod", name: "Production", slug: "prod" },
  { id: "env-dev", name: "Development", slug: "dev" }
] as ProjectEnv[];

const data = {
  folders: {
    "/apps": [{ id: "folder-api", name: "api", envId: "env-prod", path: "/apps/api" }]
  },
  secrets: {
    "/apps/api/API_KEY": [{ id: "secret-api", key: "API_KEY", env: "prod", path: "/apps/api" }]
  },
  dynamicSecrets: {
    "/database": [
      {
        id: "dynamic-db",
        name: "database-credentials",
        environment: "dev",
        path: "/database"
      }
    ]
  },
  secretRotations: {
    "/apps/api/API_KEY": [
      {
        id: "rotation-api",
        name: "API key rotation",
        environment: { name: "Production", slug: "prod" },
        folder: { path: "/apps/api" }
      }
    ]
  }
} as unknown as Pick<
  TDashboardProjectSecretsQuickSearch,
  "folders" | "secrets" | "dynamicSecrets" | "secretRotations"
>;

describe("Secret Manager command search", () => {
  it("ranks exact resource names and keeps navigation scope without secret values", () => {
    const matches = buildSecretManagerCommandMatches({
      data,
      environments,
      projectName: "Platform",
      query: "API_KEY"
    });

    assert.equal(matches[0].label, "API_KEY");
    assert.equal(matches[0].resourceType, "secret");
    assert.equal(matches[0].environmentSlug, "prod");
    assert.equal(matches[0].path, "/apps/api");
    assert.equal(matches[0].search, "API_KEY");
    assert.equal(matches[0].breadcrumb, "Platform / Production / apps / api / Secret");
    assert.equal("value" in matches[0], false);
  });

  it("maps every supported resource type and caps the result set", () => {
    const matches = buildSecretManagerCommandMatches({
      data,
      environments,
      projectName: "Platform",
      query: "api",
      limit: 3
    });

    assert.equal(matches.length, 3);
    assert.deepEqual(
      new Set(matches.map((match) => match.resourceType)),
      new Set(["folder", "rotation", "secret"])
    );
  });
});
