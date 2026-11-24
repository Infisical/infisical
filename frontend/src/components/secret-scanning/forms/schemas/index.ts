import { z } from "zod";

import { channelFormSchema, TChannelForm } from "@app/hooks/api/alerts";

import { BitbucketDataSourceSchema } from "./bitbucket-data-source-schema";
import { GitHubDataSourceSchema } from "./github-data-source-schema";
import { GitLabDataSourceSchema } from "./gitlab-data-source-schema";

// Channels are only checked while an alert is on, so a hidden, half-filled channel can't block creating the
// data source.
const DataSourceAlertsSchema = z
  .object({
    isSecretsDetectedAlertEnabled: z.boolean(),
    isScanFailedAlertEnabled: z.boolean(),
    channels: z.custom<TChannelForm[]>(),
  })
  .superRefine(
    (
      { isSecretsDetectedAlertEnabled, isScanFailedAlertEnabled, channels },
      ctx,
    ) => {
      if (!isSecretsDetectedAlertEnabled && !isScanFailedAlertEnabled) return;

      const result = z
        .array(channelFormSchema)
        .min(1, "At least one channel is required")
        .safeParse(channels);
      if (result.success) return;

      result.error.issues.forEach((issue) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["channels", ...issue.path],
        });
      });
    },
  );

export const SecretScanningDataSourceSchema = z
  .discriminatedUnion("type", [
    GitHubDataSourceSchema,
    BitbucketDataSourceSchema,
    GitLabDataSourceSchema,
  ])
  .and(DataSourceAlertsSchema);

export type TSecretScanningDataSourceForm = z.infer<
  typeof SecretScanningDataSourceSchema
>;
