import { previousSecretLocation } from "./secret-folder-events";

describe("previousSecretLocation", () => {
  const before = { environment: "dev", secretPath: "/app/old" };

  test("lists only the parts of the location that changed", () => {
    expect(previousSecretLocation(before, { environment: "dev", secretPath: "/app/new" })).toEqual({
      secretPath: "/app/old"
    });
    expect(previousSecretLocation(before, { environment: "prod", secretPath: "/app/old" })).toEqual({
      environment: "dev"
    });
    expect(previousSecretLocation(before, { environment: "prod", secretPath: "/app/new" })).toEqual(before);
  });

  // An update that left the location alone has no `previous`, rather than an empty one.
  test("is undefined when the location did not change", () => {
    expect(previousSecretLocation(before, { ...before })).toBeUndefined();
  });
});
