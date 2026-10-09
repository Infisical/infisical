import { extractPrincipalArn, isAwsRootPrincipalArn } from "./identity-aws-auth-fns";

describe("isAwsRootPrincipalArn", () => {
  test.each([
    ["arn:aws:iam::123456789012:root", true],
    ["arn:aws-us-gov:iam::123456789012:root", true],
    ["arn:aws:iam::123456789012:user/root", false],
    ["arn:aws:sts::123456789012:assumed-role/MyRole/session", false]
  ])("%s -> %s", (arn, expected) => {
    expect(isAwsRootPrincipalArn(arn)).toBe(expected);
  });
});

describe("extractPrincipalArn", () => {
  test("formats assumed-role ARNs as IAM roles when asked", () => {
    expect(extractPrincipalArn("arn:aws:sts::123456789012:assumed-role/MyRole/session", true)).toBe(
      "arn:aws:iam::123456789012:role/MyRole"
    );
  });
});
