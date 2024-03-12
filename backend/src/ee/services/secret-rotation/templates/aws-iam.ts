import { TAwsProviderSystems, TProviderFunctionTypes } from "./types";

export const AWS_IAM_TEMPLATE = {
  type: TProviderFunctionTypes.AWS as const,
  client: TAwsProviderSystems.IAM,
  inputs: {
    type: "object" as const,
    properties: {
      manager_user_access_key: { type: "string" as const },
      manager_user_secret_key: { type: "string" as const },
      manager_user_aws_region: { type: "string" as const },
      iam_username: { type: "string" as const }
    },
    required: ["manager_user_access_key", "manager_user_secret_key", "manager_user_aws_region", "iam_username"],
    additionalProperties: false
  },
  outputs: {
    iam_user_access_key: { type: "string" },
    iam_user_secret_key: { type: "string" }
  }
};
