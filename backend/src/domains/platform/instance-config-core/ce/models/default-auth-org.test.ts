import { DefaultAuthOrg } from "./default-auth-org";

describe("DefaultAuthOrg.restore", () => {
  test("should read an empty joined slug as null", () => {
    // Action
    const org = DefaultAuthOrg.restore({ defaultAuthOrgId: "org-1", defaultAuthOrgSlug: "" });

    // Assert
    expect(org.toJSON()).toEqual({
      defaultAuthOrgId: "org-1",
      defaultAuthOrgSlug: null,
      defaultAuthOrgAuthEnforced: null,
      defaultAuthOrgAuthMethod: null
    });
  });
});

describe("DefaultAuthOrg.select", () => {
  test("should change the org and keep the joined fields until the row is read again", () => {
    // Setup
    const org = DefaultAuthOrg.restore({
      defaultAuthOrgId: "org-1",
      defaultAuthOrgSlug: "first",
      defaultAuthOrgAuthEnforced: true,
      defaultAuthOrgAuthMethod: "saml"
    });

    // Action
    const selected = org.select("org-2");

    // Assert
    expect(selected.toJSON()).toEqual({
      defaultAuthOrgId: "org-2",
      defaultAuthOrgSlug: "first",
      defaultAuthOrgAuthEnforced: true,
      defaultAuthOrgAuthMethod: "saml"
    });
    expect(org.toJSON().defaultAuthOrgId).toBe("org-1");
  });
});
