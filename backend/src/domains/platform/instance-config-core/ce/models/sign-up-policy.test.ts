import { SignUpPolicy, SignUpRefusal } from "./sign-up-policy";

describe("SignUpPolicy.change", () => {
  test("should keep the values left undefined", () => {
    // Setup
    const policy = SignUpPolicy.restore({ allowSignUp: true, allowedSignUpDomain: "example.com" });

    // Action
    const changed = policy.change({ allowSignUp: false });

    // Assert
    expect(changed.toJSON()).toEqual({ allowSignUp: false, allowedSignUpDomain: "example.com" });
    expect(policy.toJSON().allowSignUp).toBe(true);
  });

  test("should clear the domain when given null", () => {
    // Setup
    const policy = SignUpPolicy.restore({ allowSignUp: true, allowedSignUpDomain: "example.com" });

    // Action
    const changed = policy.change({ allowedSignUpDomain: null });

    // Assert
    expect(changed.toJSON()).toEqual({ allowSignUp: true, allowedSignUpDomain: null });
  });
});

describe("SignUpPolicy.close", () => {
  test("should close sign-up and keep the allowed domain", () => {
    // Setup
    const policy = SignUpPolicy.restore({ allowSignUp: true, allowedSignUpDomain: "example.com" });

    // Action
    const closed = policy.close();

    // Assert
    expect(closed.toJSON()).toEqual({ allowSignUp: false, allowedSignUpDomain: "example.com" });
  });
});

describe("SignUpPolicy.refusalFor", () => {
  test.each([
    ["sign-up is closed", { allowSignUp: false }, "user@example.com", SignUpRefusal.Closed],
    ["sign-up was never set", { allowSignUp: null }, "user@example.com", SignUpRefusal.Closed],
    [
      "sign-up is closed, whatever the domain",
      { allowSignUp: false, allowedSignUpDomain: "example.com" },
      "user@example.com",
      SignUpRefusal.Closed
    ],
    [
      "the email is outside the allowed domains",
      { allowSignUp: true, allowedSignUpDomain: "example.com, example.org" },
      "user@other.com",
      SignUpRefusal.DomainNotAllowed
    ],
    [
      "the email is in an allowed domain",
      { allowSignUp: true, allowedSignUpDomain: "example.com, example.org" },
      "User@Example.org",
      null
    ],
    ["no domain is required", { allowSignUp: true, allowedSignUpDomain: null }, "user@other.com", null]
  ])("should answer when %s", (_name, record, email, expected) => {
    // Action
    const refusal = SignUpPolicy.restore(record).refusalFor(email);

    // Assert
    expect(refusal).toBe(expected);
  });
});

describe("SignUpPolicy.isOpen", () => {
  test.each([
    [true, true],
    [false, false],
    [null, false]
  ])("should read a stored %s as %s", (allowSignUp, expected) => {
    // Assert
    expect(SignUpPolicy.restore({ allowSignUp }).isOpen()).toBe(expected);
  });
});
