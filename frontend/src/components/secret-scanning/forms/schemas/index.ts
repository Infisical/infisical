import { z } from "zod";

import { channelFormSchema, TChannelForm, toChannelInput } from "@app/hooks/api/alerts";

import { BitbucketDataSourceSchema } from "./bitbucket-data-source-schema";
import { GitHubDataSourceSchema } from "./github-data-source-schema";
import { GitLabDataSourceSchema } from "./gitlab-data-source-schema";

export const serializeAlertChannels = (channels: TChannelForm[]) =>
  JSON.stringify(channels.map(toChannelInput));

export type TDataSourceAlertField = "secretsDetectedAlert" | "scanFailedAlert";

type TSavedAlert = { enabled: boolean; channels: TChannelForm[] };

// Channels are only checked while the alert is on, so a hidden, half-filled channel can't block saving the
// data source. A saved alert left as it was isn't checked either: recipient cleanup can leave it with an
// empty, disabled channel, and saving the data source doesn't send the alert again.
const buildDataSourceAlertSchema = (saved?: TSavedAlert) => {
  const savedChannels = saved && serializeAlertChannels(saved.channels);

  return z
    .object({ enabled: z.boolean(), channels: z.custom<TChannelForm[]>() })
    .superRefine(({ enabled, channels }, ctx) => {
      if (!enabled) return;
      if (saved?.enabled && savedChannels === serializeAlertChannels(channels)) return;

      const result = z
        .array(channelFormSchema)
        .min(1, "At least one channel is required")
        .safeParse(channels);
      if (result.success) return;

      result.error.issues.forEach((issue) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["channels", ...issue.path]
        });
      });
    });
};

// Each alert keeps its own channels. `savedAlerts` holds an edit's alerts as they were when it opened.
export const buildSecretScanningDataSourceSchema = (
  savedAlerts: Partial<Record<TDataSourceAlertField, TSavedAlert>> = {}
) =>
  z
    .discriminatedUnion("type", [
      GitHubDataSourceSchema,
      BitbucketDataSourceSchema,
      GitLabDataSourceSchema
    ])
    .and(
      z.object({
        secretsDetectedAlert: buildDataSourceAlertSchema(savedAlerts.secretsDetectedAlert),
        scanFailedAlert: buildDataSourceAlertSchema(savedAlerts.scanFailedAlert)
      })
    );

export type TSecretScanningDataSourceForm = z.infer<
  ReturnType<typeof buildSecretScanningDataSourceSchema>
>;
