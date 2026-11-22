import { describe, expect, it } from "vitest";

import { CoolifyResourceType } from "@app/services/app-connection/coolify/coolify-connection-enums";

import { CoolifySyncScope } from "./coolify-sync-enums";
import { CreateCoolifySyncSchema } from "./coolify-sync-schemas";

const parseDestinationConfig = (resourceType: CoolifyResourceType, scope?: CoolifySyncScope) =>
  CreateCoolifySyncSchema.shape.destinationConfig.safeParse({
    resourceType,
    resourceId: "res-uuid",
    resourceName: "api",
    scope
  });

describe("CreateCoolifySyncSchema destination", () => {
  it("syncs production variables unless told otherwise", () => {
    const result = parseDestinationConfig(CoolifyResourceType.Service);

    expect(result.success && result.data.scope).toBe(CoolifySyncScope.Production);
  });

  it("accepts the preview scope for an application", () => {
    expect(parseDestinationConfig(CoolifyResourceType.Application, CoolifySyncScope.Preview).success).toBe(true);
  });

  it.each([CoolifyResourceType.Service, CoolifyResourceType.Database])(
    "rejects the preview scope for a %s, which has no preview variables",
    (resourceType) => {
      expect(parseDestinationConfig(resourceType, CoolifySyncScope.Preview).success).toBe(false);
    }
  );
});
