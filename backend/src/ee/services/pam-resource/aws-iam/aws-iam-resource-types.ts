import { z } from "zod";

import {
  AwsIamAccountCredentialsSchema,
  AwsIamAccountSchema,
  AwsIamResourceConnectionDetailsSchema,
  AwsIamResourceSchema
} from "./aws-iam-resource-schemas";

// Resources
export type TAwsIamResource = z.infer<typeof AwsIamResourceSchema>;
export type TAwsIamResourceConnectionDetails = z.infer<typeof AwsIamResourceConnectionDetailsSchema>;

// Accounts
export type TAwsIamAccount = z.infer<typeof AwsIamAccountSchema>;
export type TAwsIamAccountCredentials = z.infer<typeof AwsIamAccountCredentialsSchema>;