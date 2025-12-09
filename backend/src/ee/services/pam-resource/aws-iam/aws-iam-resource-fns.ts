import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

import { AwsIamResourceListItemSchema } from "./aws-iam-resource-schemas";

export const getAwsIamResourceListItem = () => {
  return {
    name: AwsIamResourceListItemSchema.shape.name.value,
    resource: AwsIamResourceListItemSchema.shape.resource.value
  };
};

/**
 * Extract the AWS Account ID from an IAM Role ARN
 * ARN format: arn:aws:iam::123456789012:role/RoleName
 */
export const extractAwsAccountIdFromArn = (roleArn: string): string => {
  const match = roleArn.match(new RE2("^arn:aws:iam::(\\d{12}):role/"));
  if (!match) {
    throw new BadRequestError({ message: "Invalid IAM Role ARN format" });
  }
  return match[1];
};
