import { PermissionDeniedError } from "@app/domains/lib/errors";
import { identityPrincipal, userPrincipal } from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";

import { BillingAccess } from "./billing-access";

describe("BillingAccess.canReadAcrossOrgs", () => {
  test("should allow a self-hosted superadmin user and a self-hosted instance admin identity", () => {
    // Setup
    const user = BillingAccess.of(userPrincipal({ isSuperAdmin: true }), false);
    const identity = BillingAccess.of(identityPrincipal({ isInstanceAdmin: true }), false);

    // Action
    const result = [user.canReadAcrossOrgs(), identity.canReadAcrossOrgs()];

    // Assert
    expect(result).toEqual([true, true]);
  });

  test("should refuse an instance admin on cloud, where orgs are separate customers", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal({ isSuperAdmin: true }), true);

    // Action
    const result = access.canReadAcrossOrgs();

    // Assert
    expect(result).toBe(false);
  });

  test("should refuse a user or identity that is not an instance admin", () => {
    // Setup
    const user = BillingAccess.of(userPrincipal(), false);
    const identity = BillingAccess.of(identityPrincipal(), false);

    // Action
    const result = [user.canReadAcrossOrgs(), identity.canReadAcrossOrgs()];

    // Assert
    expect(result).toEqual([false, false]);
  });

  test("should refuse an OAuth principal narrowed to scopes, including an empty scope list", () => {
    // Setup
    const empty = BillingAccess.of(userPrincipal({ isSuperAdmin: true, oauth: { clientId: "c", scopes: [] } }), false);
    const narrowed = BillingAccess.of(
      identityPrincipal({ isInstanceAdmin: true, oauth: { clientId: "c", scopes: ["x"] } }),
      false
    );

    // Action
    const result = [empty.canReadAcrossOrgs(), narrowed.canReadAcrossOrgs()];

    // Assert
    expect(result).toEqual([false, false]);
  });

  test("should allow a fully delegated OAuth principal whose scopes are not narrowed", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal({ isSuperAdmin: true, oauth: { clientId: "c" } }), false);

    // Action
    const result = access.canReadAcrossOrgs();

    // Assert
    expect(result).toBe(true);
  });
});

describe("BillingAccess.readsWithoutMembership", () => {
  test("should be false for the actor's own org and true for another org an instance admin reads", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal({ isSuperAdmin: true }), false);

    // Action
    const result = [access.readsWithoutMembership("org-a", "org-a"), access.readsWithoutMembership("org-b", "org-a")];

    // Assert
    expect(result).toEqual([false, true]);
  });

  test("should be false for another org when the actor cannot read across orgs", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal(), false);

    // Action
    const result = access.readsWithoutMembership("org-b", "org-a");

    // Assert
    expect(result).toBe(false);
  });
});

describe("BillingAccess.assertInstanceWide", () => {
  test("should refuse with a message naming the self-hosted instance admin requirement", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal({ isSuperAdmin: true }), true);

    // Action
    const result = () => access.assertInstanceWide();

    // Assert
    expect(result).toThrow(PermissionDeniedError);
    expect(result).toThrow("Instance-wide usage can only be read by an instance admin on a self-hosted instance.");
  });

  test("should allow a self-hosted instance admin", () => {
    // Setup
    const access = BillingAccess.of(userPrincipal({ isSuperAdmin: true }), false);

    // Action
    const result = () => access.assertInstanceWide();

    // Assert
    expect(result).not.toThrow();
  });
});
