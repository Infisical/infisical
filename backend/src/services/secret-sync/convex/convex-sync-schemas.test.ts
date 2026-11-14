import { describe, expect, it } from "vitest";

import { CreateConvexSyncSchema } from "./convex-sync-schemas";

const createInput = (overrides: { keySchema?: string; deploymentName?: string } = {}) => ({
  name: "convex-sync",
  projectId: "project-id",
  connectionId: "11111111-1111-4111-8111-111111111111",
  environment: "prod",
  secretPath: "/",
  syncOptions: { initialSyncBehavior: "overwrite-destination", keySchema: overrides.keySchema },
  destinationConfig: { deploymentName: overrides.deploymentName ?? "playful-otter-123" }
});

describe("CreateConvexSyncSchema", () => {
  it("accepts a deployment name and a key schema Convex can store", () => {
    expect(
      CreateConvexSyncSchema.safeParse(createInput({ keySchema: "INF_{{environment}}_{{secretKey}}" })).success
    ).toBe(true);
  });

  it("rejects a key schema whose literal characters Convex refuses", () => {
    const result = CreateConvexSyncSchema.safeParse(createInput({ keySchema: "INF-{{secretKey}}" }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["syncOptions", "keySchema"]);
  });

  it("rejects a deployment name that is not a Convex deployment name", () => {
    expect(CreateConvexSyncSchema.safeParse(createInput({ deploymentName: "../teams" })).success).toBe(false);
    expect(CreateConvexSyncSchema.safeParse(createInput({ deploymentName: "https://x.convex.cloud" })).success).toBe(
      false
    );
  });
});
