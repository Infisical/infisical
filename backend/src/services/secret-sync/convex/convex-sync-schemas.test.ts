import { areSecretSyncDestinationConfigsEqual } from "../secret-sync-duplicate-check";
import { SecretSync } from "../secret-sync-enums";
import { ConvexSyncDestinationConfigSchema } from "./convex-sync-schemas";

describe("ConvexSyncDestinationConfigSchema", () => {
  it("normalizes trailing slashes so duplicate-destination checks match", () => {
    const withSlash = ConvexSyncDestinationConfigSchema.parse({
      deploymentUrl: "https://playful-otter-123.convex.cloud/",
      deploymentName: "playful-otter-123"
    });
    const withoutSlash = ConvexSyncDestinationConfigSchema.parse({
      deploymentUrl: "https://playful-otter-123.convex.cloud",
      deploymentName: "playful-otter-123"
    });

    expect(withSlash.deploymentUrl).toBe("https://playful-otter-123.convex.cloud");
    expect(withoutSlash.deploymentUrl).toBe("https://playful-otter-123.convex.cloud");
    expect(areSecretSyncDestinationConfigsEqual(SecretSync.Convex, withSlash, withoutSlash, ["deploymentName"])).toBe(
      true
    );
  });

  it("rejects non-HTTPS deployment URLs", () => {
    const result = ConvexSyncDestinationConfigSchema.safeParse({
      deploymentUrl: "http://playful-otter-123.convex.cloud",
      deploymentName: "playful-otter-123"
    });

    expect(result.success).toBe(false);
  });
});
