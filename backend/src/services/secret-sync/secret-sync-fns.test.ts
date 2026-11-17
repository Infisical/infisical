import { describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { SecretSync } from "./secret-sync-enums";
import { assertKeySchemaProducesValidNames } from "./secret-sync-fns";

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
    ).toThrow("'prod-eu_EXAMPLE'");
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
