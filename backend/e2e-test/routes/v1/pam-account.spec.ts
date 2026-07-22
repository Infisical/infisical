// Exercises the AWS IAM PAM account roleArn format validation (pam-account-schemas.ts)
// through the real HTTP route with JWT auth, so a malformed ARN is rejected up front
// (422 ValidationFailure) instead of only failing later at AssumeRole time.

// Valid-format UUIDs that intentionally don't reference real rows, so the only body-level
// validation issue is the roleArn itself.
const DUMMY_UUID = "00000000-0000-4000-8000-000000000000";

const createAwsIamAccount = (roleArn: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/pam/accounts/aws-iam",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      name: "arn-validation-test",
      folderId: DUMMY_UUID,
      templateId: DUMMY_UUID,
      connectionDetails: { roleArn },
      credentials: {}
    }
  });

describe("PAM AWS IAM Account Router - roleArn validation", () => {
  test.each([
    "not-an-arn",
    "arn:aws:iam::123456789012:user/my-user", // user, not role
    "arn:aws:iam::12345:role/my-role", // account id not 12 digits
    "arn:aws:s3:::my-bucket", // wrong service
    "arn:aws:iam::123456789012:role/" // empty role name
  ])("rejects malformed role ARN: %s", async (roleArn) => {
    const res = await createAwsIamAccount(roleArn);
    expect(res.statusCode).toBe(422);
    expect(res.payload).toContain("valid IAM role ARN");
  });

  test.each([
    "arn:aws:iam::123456789012:role/my-role",
    "arn:aws:iam::123456789012:role/service-role/my-role",
    "arn:aws-us-gov:iam::123456789012:role/gov-role",
    "arn:aws-cn:iam::123456789012:role/cn-role",
    "arn:aws-iso-b:iam::123456789012:role/iso-b-role"
  ])("accepts well-formed role ARN (passes format validation): %s", async (roleArn) => {
    const res = await createAwsIamAccount(roleArn);
    // The ARN format check passes; the request then fails downstream on the dummy
    // folder/template lookup, NOT on ARN validation. So it must not be a 422 that
    // references the ARN rule.
    expect(res.statusCode).not.toBe(422);
    expect(res.payload).not.toContain("valid IAM role ARN");
  });
});
