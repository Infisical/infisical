import RE2 from "re2";

// Matches every valid AWS IAM role ARN without enumerating parts that can grow:
//  - partition: `aws` plus optional hyphenated segments (aws, aws-cn, aws-us-gov, aws-iso*, and any AWS adds later)
//  - service is always `iam`, region is always empty, account id is 12 digits
//  - resource is `role/` + path/name, matched against the printable-ASCII range AWS documents for
//    IAM paths (0x21 to 0x7F), so unusual-but-valid role paths (e.g. service-linked role paths) are not rejected
const AWS_IAM_ROLE_ARN_PATTERN = new RE2(/^arn:aws(-[a-z]+)*:iam::\d{12}:role\/[\x21-\x7F]+$/);

export const isAwsIamRoleArn = (value: string) => AWS_IAM_ROLE_ARN_PATTERN.test(value);
