import { RuleViolationError, StateConflictError } from "@app/domains/lib/errors";

import { InstanceSetup } from "./instance-setup";

const notSetUp = () =>
  InstanceSetup.restore({ initialized: false, onboardingCompleted: false, adminIdentityIds: null });

describe("InstanceSetup.complete", () => {
  test("should mark the instance set up and leave the original unchanged", () => {
    // Setup
    const setup = notSetUp();

    // Action
    const completed = setup.complete();

    // Assert
    expect(completed.toJSON().initialized).toBe(true);
    expect(setup.toJSON().initialized).toBe(false);
  });

  test("should refuse an instance already set up", () => {
    // Setup
    const setup = notSetUp().complete();

    // Action
    const act = () => setup.complete();

    // Assert
    expect(act).toThrow(StateConflictError);
    expect(act).toThrow("Instance has already been set up");
  });
});

describe("InstanceSetup.grantAdminIdentity", () => {
  test("should grant an identity once however often it is granted", () => {
    // Setup
    const setup = notSetUp();

    // Action
    const granted = setup.grantAdminIdentity("identity-1").grantAdminIdentity("identity-1");

    // Assert
    expect(granted.toJSON().adminIdentityIds).toEqual(["identity-1"]);
    expect(setup.isAdminIdentity("identity-1")).toBe(false);
  });
});

describe("InstanceSetup.revokeAdminIdentity", () => {
  test("should remove only the revoked identity", () => {
    // Setup
    const setup = notSetUp().grantAdminIdentity("identity-1").grantAdminIdentity("identity-2");

    // Action
    const revoked = setup.revokeAdminIdentity("identity-1");

    // Assert
    expect(revoked.toJSON().adminIdentityIds).toEqual(["identity-2"]);
  });

  test("should refuse an identity that is not an admin", () => {
    // Setup
    const setup = notSetUp().grantAdminIdentity("identity-1");

    // Action
    const act = () => setup.revokeAdminIdentity("identity-2");

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("Identity does not have super admin access");
  });
});

describe("InstanceSetup.changeOnboardingStatus", () => {
  test("should change only the onboarding status", () => {
    // Setup
    const setup = notSetUp().complete().grantAdminIdentity("identity-1");

    // Action
    const changed = setup.changeOnboardingStatus(true);

    // Assert
    expect(changed.toJSON()).toEqual({
      initialized: true,
      onboardingCompleted: true,
      adminIdentityIds: ["identity-1"]
    });
  });
});

describe("InstanceSetup.restore", () => {
  test("should read missing columns as null", () => {
    // Action
    const setup = InstanceSetup.restore({ onboardingCompleted: false });

    // Assert
    expect(setup.toJSON()).toEqual({ initialized: null, onboardingCompleted: false, adminIdentityIds: null });
  });
});
