import { describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { SecretSync } from "./secret-sync-enums";
import { assertKeySchemaProducesValidNames, matchesSchema } from "./secret-sync-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

describe("assertKeySchemaProducesValidNames", () => {
  it("rejects a key schema that only fails once the environment slug is filled in", () => {
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Convex,
        keySchema: "{{environment}}_{{secretKey}}",
        environment: "prod-eu"
      })
    ).toThrow(BadRequestError);
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Convex,
        keySchema: "{{environment}}_{{secretKey}}",
        environment: "prod-eu"
      })
    ).toThrow("'prod-eu_A'");
  });

  it("rejects a key schema whose own characters the destination refuses", () => {
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Convex,
        keySchema: "INF-{{secretKey}}",
        environment: "prod"
      })
    ).toThrow(BadRequestError);
  });

  it("accepts a key schema the destination can store", () => {
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Convex,
        keySchema: "INF_{{environment}}_{{secretKey}}",
        environment: "prod"
      })
    ).not.toThrow();
  });

  it("accepts a key schema that only fits short secret keys", () => {
    // 225 + 25 + 1 = 251 characters, under Convex's 256 limit
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Convex,
        keySchema: `${"A".repeat(225)}{{environment}}{{secretKey}}`,
        environment: "e".repeat(25)
      })
    ).not.toThrow();
  });

  it("checks Coolify key schemas against the environment and Coolify's managed SERVICE_ prefix", () => {
    const check = (keySchema: string, environment: string) => () =>
      assertKeySchemaProducesValidNames({ destination: SecretSync.Coolify, keySchema, environment });

    expect(check("{{environment}}_{{secretKey}}", "prod-eu")).toThrow("'prod-eu_A'");
    expect(check("SERVICE_{{secretKey}}", "prod")).toThrow(BadRequestError);
    expect(check("app.{{environment}}_{{secretKey}}", "prod")).not.toThrow();
  });

  it("skips syncs without a key schema and destinations without a name rule", () => {
    expect(() =>
      assertKeySchemaProducesValidNames({ destination: SecretSync.Convex, environment: "prod-eu" })
    ).not.toThrow();
    expect(() =>
      assertKeySchemaProducesValidNames({
        destination: SecretSync.Daytona,
        keySchema: "{{environment}}_{{secretKey}}",
        environment: "prod-eu"
      })
    ).not.toThrow();
  });
});

describe("matchesSchema with mirrored folders", () => {
  const mirroredFolders = new Set(["", "api"]);

  it("matches names in a mirrored folder", () => {
    expect(matchesSchema("DB_URL", "dev", undefined, { mirroredFolders })).toBe(true);
    expect(matchesSchema("api/DB_URL", "dev", undefined, { mirroredFolders })).toBe(true);
  });

  it("leaves names in other folders alone, even without a key schema", () => {
    expect(matchesSchema("team-a/DB_URL", "dev", undefined, { mirroredFolders })).toBe(false);
    expect(matchesSchema("api/nested/DB_URL", "dev", undefined, { mirroredFolders })).toBe(false);
  });

  it("applies the key schema to the last segment only", () => {
    expect(matchesSchema("api/INF_DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(true);
    expect(matchesSchema("api/DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(false);
  });

  it("leaves a name matching the key schema alone when its folder is not mirrored", () => {
    expect(matchesSchema("team-a/INF_DB_URL", "dev", "INF_{{secretKey}}", { mirroredFolders })).toBe(false);
  });
});
