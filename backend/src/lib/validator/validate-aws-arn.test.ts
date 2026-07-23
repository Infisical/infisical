import { isAwsIamRoleArn } from "./validate-aws-arn";

describe("isAwsIamRoleArn", () => {
  test.each([
    "arn:aws:iam::123456789012:role/my-role",
    "arn:aws:iam::123456789012:role/service-role/my-role",
    "arn:aws:iam::123456789012:role/team.dev/deploy@svc+build",
    // partitions: standard, GovCloud, China, ISO family, and any future hyphenated partition
    "arn:aws-us-gov:iam::123456789012:role/gov-role",
    "arn:aws-cn:iam::123456789012:role/cn-role",
    "arn:aws-iso:iam::123456789012:role/iso-role",
    "arn:aws-iso-b:iam::123456789012:role/iso-b-role",
    // IAM role paths allow the full printable-ASCII range, not just role-name characters
    "arn:aws:iam::123456789012:role/odd!path$/role_name",
    "arn:aws:iam::123456789012:role/aws-service-role/elasticbeanstalk.amazonaws.com/AWSServiceRoleForElasticBeanstalk"
  ])("accepts valid role ARN: %s", (arn) => {
    expect(isAwsIamRoleArn(arn)).toBe(true);
  });

  test.each([
    "not-an-arn",
    "arn:aws:iam::123456789012:user/my-user", // user, not role
    "arn:aws:iam::12345:role/my-role", // account id not 12 digits
    "arn:aws:s3:::my-bucket", // wrong service
    "arn:aws:iam:us-east-1:123456789012:role/regional", // IAM ARNs have no region
    "arn:aws:iam::123456789012:role/", // empty role name
    "arn:awsx:iam::123456789012:role/my-role", // partition must be aws or aws-<segment>
    "arn:aws:iam::123456789012:role/has space" // resource may not contain spaces / control chars
  ])("rejects invalid role ARN: %s", (arn) => {
    expect(isAwsIamRoleArn(arn)).toBe(false);
  });
});
