import { SignUpPolicy } from "./sign-up-policy";

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
