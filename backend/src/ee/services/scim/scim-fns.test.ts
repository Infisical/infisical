import { ScimRequestError } from "@app/lib/errors";

import {
  applyScimPatch,
  assertParsableScimFilter,
  buildScimUser,
  isScimActive,
  parseScimGroupFilter
} from "./scim-fns";

const scimErrorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScimRequestError) return err;
    throw err;
  }
  throw new Error("expected a ScimRequestError");
};

describe("parseScimGroupFilter", () => {
  test("keeps a display name containing the operator text intact", () => {
    expect(parseScimGroupFilter('displayName eq "Requests"')).toEqual({ name: "Requests" });
    expect(parseScimGroupFilter('displayName eq "equity eq team"')).toEqual({ name: "equity eq team" });
  });

  test("treats the attribute name case-insensitively", () => {
    expect(parseScimGroupFilter('DisplayName eq "Eng"')).toEqual({ name: "Eng" });
  });

  test("looks up by id, and matches nothing for an id that is not a UUID", () => {
    const id = "2b9f6c1e-1f0a-4d6e-9a43-6a3e6f1c2d7b";
    expect(parseScimGroupFilter(`id eq "${id}"`)).toEqual({ id });
    expect(parseScimGroupFilter('id eq "not-a-uuid"')).toBeNull();
  });

  test("returns no constraint without a filter", () => {
    expect(parseScimGroupFilter(undefined)).toEqual({});
  });

  test.each(["displayName eq", 'displayName sw "Eng"', 'externalId eq "x"', 'displayName eq "a" or id eq "b"'])(
    "refuses %s as invalidFilter",
    (filter) => {
      const err = scimErrorOf(() => parseScimGroupFilter(filter));
      expect(err.status).toBe(400);
      expect(err.scimType).toBe("invalidFilter");
    }
  );
});

describe("assertParsableScimFilter", () => {
  test("accepts a valid filter and refuses one that does not parse", () => {
    expect(() => assertParsableScimFilter('userName eq "a@b.test" and active eq true')).not.toThrow();
    const err = scimErrorOf(() => assertParsableScimFilter("userName eq"));
    expect(err.status).toBe(400);
    expect(err.scimType).toBe("invalidFilter");
  });
});

describe("applyScimPatch", () => {
  const user = () =>
    buildScimUser({
      orgMembershipId: "m-1",
      username: "a@b.test",
      email: "a@b.test",
      firstName: "Ada",
      lastName: "L",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

  test("applies a valid operation", () => {
    const patched = applyScimPatch(user(), [{ op: "replace", path: "active", value: false }]);
    expect(patched.active).toBe(false);
  });

  test("answers 400 with the library's scimType for a malformed path", () => {
    const err = scimErrorOf(() => applyScimPatch(user(), [{ op: "replace", path: "name[", value: "x" }]));
    expect(err.status).toBe(400);
    expect(err.scimType).toBe("invalidSyntax");
  });
});

describe("isScimActive", () => {
  test.each([
    [true, true],
    [false, false],
    ["True", true],
    ["False", false],
    ["false", false]
  ])("reads %s as %s", (value, expected) => {
    expect(isScimActive(value)).toBe(expected);
  });
});
