import RE2 from "re2";

// Validates the STRUCTURE of an AWS IAM role ARN while staying permissive about the parts that vary, so a
// legitimate role name/path is never rejected. Being slightly over-permissive on the resource is intentional;
// the value is in the structural anchors:
//  - partition: `aws` plus optional hyphenated segments (aws, aws-cn, aws-us-gov, aws-iso*, and any AWS adds later)
//  - service is always `iam`, region is always empty, account id is 12 digits
//  - resource: `role/` followed by any non-whitespace path/name. AWS's documented charset (role names
//    [\w+=,.@-], paths ASCII 0x21-0x7E) is a subset of non-whitespace, so \S+ accepts every valid value.
const AWS_IAM_ROLE_ARN_PATTERN = new RE2(/^arn:aws(-[a-z0-9]+)*:iam::\d{12}:role\/\S+$/);

export const isAwsIamRoleArn = (value: string) => AWS_IAM_ROLE_ARN_PATTERN.test(value);
