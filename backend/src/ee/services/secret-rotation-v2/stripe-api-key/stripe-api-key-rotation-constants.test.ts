import { STRIPE_API_KEY_PERMISSION_GROUPS, STRIPE_API_KEY_PERMISSIONS } from "./stripe-api-key-rotation-constants";

describe("STRIPE_API_KEY_PERMISSION_GROUPS", () => {
  const cataloged = STRIPE_API_KEY_PERMISSION_GROUPS.flatMap(({ resources }) =>
    resources.flatMap(({ read, write }) => [read, write].filter(Boolean))
  );

  test("lists every accepted permission exactly once", () => {
    expect([...cataloged].sort()).toEqual([...STRIPE_API_KEY_PERMISSIONS].sort());
  });

  test("gives every resource at least one permission", () => {
    STRIPE_API_KEY_PERMISSION_GROUPS.forEach(({ resources }) =>
      resources.forEach((resource) => expect(resource.read ?? resource.write).toBeDefined())
    );
  });

  test("keeps resource names unique within a group", () => {
    STRIPE_API_KEY_PERMISSION_GROUPS.forEach(({ resources }) => {
      const names = resources.map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
