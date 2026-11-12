import { useState } from "react";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";
import { StatusText } from "@infisical/cipher/ui/text";
import { format } from "date-fns";
import { z } from "zod";

import type { TCertificateCleanupConfig } from "@app/hooks/api/certificateCleanup/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const DOCS_URL =
  "https://infisical.com/docs/documentation/platform/pki/settings/certificate-cleanup";

const schema = z.object({
  isEnabled: z.boolean(),
  postExpiryRetentionDays: z.coerce
    .number({ invalid_type_error: "Enter a number of days" })
    .int("Enter a whole number of days")
    .min(1, "Use at least 1 day")
    .max(30, "Use 30 days or fewer"),
  skipCertsWithActiveSyncs: z.boolean()
});

type Draft = {
  isEnabled: boolean;
  postExpiryRetentionDays: string;
  skipCertsWithActiveSyncs: boolean;
};

const draftOf = (config: TCertificateCleanupConfig | null | undefined): Draft => ({
  isEnabled: config?.isEnabled ?? false,
  postExpiryRetentionDays: String(config?.postExpiryRetentionDays ?? 3),
  skipCertsWithActiveSyncs: config?.skipCertsWithActiveSyncs ?? true
});

const Title = () => (
  <Inline gap={8} align="center">
    Certificate cleanup
    <DocumentationLinkBadge href={DOCS_URL} />
  </Inline>
);

const CleanupForm = ({ config }: { config: TCertificateCleanupConfig | null }) => {
  const updateConfig = useV4Adapter("certManagerSettings").useUpdateCleanupConfig();
  const [savedDraft, setSavedDraft] = useState(() => draftOf(config));
  const [draft, setDraft] = useState(savedDraft);
  const dirty =
    draft.isEnabled !== savedDraft.isEnabled ||
    draft.postExpiryRetentionDays !== savedDraft.postExpiryRetentionDays ||
    draft.skipCertsWithActiveSyncs !== savedDraft.skipCertsWithActiveSyncs;
  const parsed = schema.safeParse(draft);
  const error = dirty
    ? parsed.error?.flatten().fieldErrors.postExpiryRetentionDays?.[0]
    : undefined;
  return (
    <SettingsCard
      title={<Title />}
      dirty={dirty}
      onDiscard={() => setDraft(savedDraft)}
      onSave={async () => {
        if (!parsed.success) throw new Error("Fix the highlighted field, then save again.");
        await updateConfig.mutateAsync(parsed.data);
        setSavedDraft(draft);
        saved("Certificate cleanup saved");
      }}
    >
      <Stack gap={16}>
        {config?.lastRunAt && (
          <DataList
            variant="props"
            density="compact"
            items={[
              [
                "Last run",
                <StatusText
                  key="status"
                  tone={config.lastRunStatus === "success" ? "ok" : "bad"}
                  icon={config.lastRunStatus === "success" ? "check-c" : "alert"}
                >
                  {config.lastRunStatus === "success" ? "Succeeded" : "Failed"} on{" "}
                  {format(new Date(config.lastRunAt), "MMM d, yyyy, h:mm a")}
                </StatusText>
              ],
              [
                "Removed",
                `${config.lastRunCertsDeleted} ${config.lastRunCertsDeleted === 1 ? "certificate" : "certificates"}`
              ]
            ]}
          />
        )}
        <Switch
          layout="row"
          label="Remove expired certificates"
          description="Deletes certificates that stay expired past the retention period."
          checked={draft.isEnabled}
          onChange={(checked) => setDraft({ ...draft, isEnabled: checked })}
        />
        <Field
          label="Retention after expiry (days)"
          description="Between 1 and 30 days."
          error={error}
        >
          <Input
            type="number"
            min={1}
            max={30}
            step={1}
            value={draft.postExpiryRetentionDays}
            invalid={Boolean(error)}
            disabled={!draft.isEnabled}
            onChange={(event) =>
              setDraft({ ...draft, postExpiryRetentionDays: event.target.value })
            }
          />
        </Field>
        <Switch
          layout="row"
          label="Skip certificates with active syncs"
          description="Keeps certificates that are synced to external services."
          checked={draft.isEnabled && draft.skipCertsWithActiveSyncs}
          disabled={!draft.isEnabled}
          onChange={(checked) => setDraft({ ...draft, skipCertsWithActiveSyncs: checked })}
        />
      </Stack>
    </SettingsCard>
  );
};

export const CleanupTab = () => {
  const { data: config, isPending } = useV4Adapter("certManagerSettings").useCleanupConfig();
  if (isPending) return <SettingsCard title={<Title />} loading />;
  return <CleanupForm config={config ?? null} />;
};
