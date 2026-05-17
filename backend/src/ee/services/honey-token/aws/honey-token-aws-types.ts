import { z } from "zod";

export const AwsHoneyTokenCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string()
});

export type TAwsHoneyTokenCredentials = z.infer<typeof AwsHoneyTokenCredentialsSchema>;

export const AwsHoneyTokenDecryptedCredentialsSchema = AwsHoneyTokenCredentialsSchema.extend({
  iamUserName: z.string()
});

export type TAwsHoneyTokenDecryptedCredentials = z.infer<typeof AwsHoneyTokenDecryptedCredentialsSchema>;
