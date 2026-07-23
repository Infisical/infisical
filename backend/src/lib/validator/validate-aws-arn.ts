import RE2 from "re2";

// Validates the structure of an AWS IAM role ARN, matching each segment to what AWS actually allows so a
// legitimate role is never rejected:
//  - partition: `aws` plus optional hyphenated segments (aws, aws-cn, aws-us-gov, aws-iso*, and any AWS adds later)
//  - service is always `iam`, region is always empty, account id is 12 digits
//  - resource: `role/`, an optional path (AWS's broad path charset, ASCII 0x21-0x7E, may include slashes),
//    then the role name. The name uses AWS's RoleName charset ([\w+=,.@-]), so an invalid name is caught here
//    instead of passing through to a later AssumeRole failure.
const AWS_IAM_ROLE_ARN_PATTERN = new RE2(/^arn:aws(-[a-z0-9]+)*:iam::\d{12}:role\/([\x21-\x7e]*\/)?[\w+=,.@-]+$/);

export const isAwsIamRoleArn = (value: string) => AWS_IAM_ROLE_ARN_PATTERN.test(value);
