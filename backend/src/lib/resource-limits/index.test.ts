import { BadRequestError } from "@app/lib/errors";

import { assertWithinResourceLimit, getResourceLimit, ResourceLimit } from ".";

const config = { INFISICAL_CLOUD: true };

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

describe("resource limits", () => {
  beforeEach(() => {
    config.INFISICAL_CLOUD = true;
  });

  test("caps apply on Infisical Cloud", () => {
    expect(getResourceLimit(ResourceLimit.WebhooksPerProject)).toBe(100);
  });

  test("self-hosted instances are never capped", () => {
    config.INFISICAL_CLOUD = false;
    expect(getResourceLimit(ResourceLimit.WebhooksPerProject)).toBeNull();
    expect(() =>
      assertWithinResourceLimit({ limit: ResourceLimit.WebhooksPerProject, used: 1_000_000, describe: () => "over" })
    ).not.toThrow();
  });

  test("allows reaching the cap and refuses going past it", () => {
    const check = (used: number, adding?: number) => () =>
      assertWithinResourceLimit({
        limit: ResourceLimit.WebhooksPerProject,
        used,
        adding,
        describe: (max) => `at most ${max}`
      });

    expect(check(99)).not.toThrow();
    expect(check(100)).toThrow(BadRequestError);
    expect(check(100)).toThrow("at most 100");
    expect(check(95, 5)).not.toThrow();
    expect(check(95, 6)).toThrow(BadRequestError);
  });
});
