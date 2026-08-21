import { InvalidScimPatchOp, scimPatch, ScimResource } from "scim-patch";
import { afterEach, describe, expect, test } from "vitest";

const POLLUTION_PROPERTY = "infisicalScimPatchPolluted";
const GLOBAL_PROTOTYPES = [Object.prototype, Array.prototype, Function.prototype];

type TTestScimUser = ScimResource & {
  name: {
    familyName: string;
    givenName: string;
  };
};

const buildScimUser = (): TTestScimUser => ({
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
  name: {
    familyName: "Parker",
    givenName: "Peter"
  },
  meta: {
    created: new Date("2026-01-01T00:00:00.000Z"),
    lastModified: new Date("2026-01-01T00:00:00.000Z")
  }
});

const expectGlobalPrototypesToBeClean = () => {
  GLOBAL_PROTOTYPES.forEach((prototype) => {
    expect(Object.getOwnPropertyDescriptor(prototype, POLLUTION_PROPERTY)).toBeUndefined();
  });
  expect(POLLUTION_PROPERTY in {}).toBe(false);
};

afterEach(() => {
  GLOBAL_PROTOTYPES.forEach((prototype) => {
    Reflect.deleteProperty(prototype, POLLUTION_PROPERTY);
  });
});

describe("scimPatch prototype pollution protection", () => {
  test("rejects a __proto__ value path without modifying global prototypes", () => {
    expectGlobalPrototypesToBeClean();

    expect(() =>
      scimPatch(buildScimUser(), [
        {
          op: "add",
          path: "name",
          value: { [`__proto__.${POLLUTION_PROPERTY}`]: true }
        }
      ])
    ).toThrow(InvalidScimPatchOp);

    expectGlobalPrototypesToBeClean();
  });

  test("rejects a constructor.prototype value path without modifying global prototypes", () => {
    expectGlobalPrototypesToBeClean();

    expect(() =>
      scimPatch(buildScimUser(), [
        {
          op: "add",
          path: "name",
          value: { [`constructor.prototype.${POLLUTION_PROPERTY}`]: true }
        }
      ])
    ).toThrow(InvalidScimPatchOp);

    expectGlobalPrototypesToBeClean();
  });

  test("continues to apply legitimate nested SCIM patches", () => {
    const scimUser = buildScimUser();

    const patchedUser = scimPatch(scimUser, [
      {
        op: "replace",
        path: "name.givenName",
        value: "Miles"
      }
    ]);

    expect(patchedUser).toBe(scimUser);
    expect(patchedUser.name).toEqual({
      familyName: "Parker",
      givenName: "Miles"
    });
    expectGlobalPrototypesToBeClean();
  });
});
