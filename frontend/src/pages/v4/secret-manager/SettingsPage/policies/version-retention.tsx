import { useState } from "react";
import { z } from "zod";

import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import type { Project } from "@app/hooks/api/projects/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

const limitSchema = z.coerce
  .number({ invalid_type_error: "Enter a number" })
  .int("Enter a whole number")
  .min(1, "Keep at least 1 version")
  .max(100, "Keep at most 100 versions");

export const VersionRetentionSection = ({
  project,
  lockedReason
}: {
  project: Project;
  lockedReason?: string;
}) => {
  const updateProject = useV4Adapter("projectSettings").useUpdateProject();
  const [savedLimit, setSavedLimit] = useState(String(project.pitVersionLimit || 10));
  const [draft, setDraft] = useState(savedLimit);
  const dirty = draft !== savedLimit;
  const parsed = limitSchema.safeParse(draft);
  const error = dirty && !parsed.success ? parsed.error.issues[0]?.message : undefined;
  return (
    <SettingsCard
      title="Version retention"
      description="Excess versions are removed at midnight UTC each day."
      dirty={dirty}
      locked={lockedReason}
      onDiscard={() => setDraft(savedLimit)}
      onSave={async () => {
        if (!parsed.success) throw new Error("Enter a number from 1 to 100, then save again.");
        await updateProject.mutateAsync({ projectId: project.id, pitVersionLimit: parsed.data });
        setSavedLimit(String(parsed.data));
        setDraft(String(parsed.data));
        saved("Version limit updated");
      }}
    >
      <Field label="Recent versions to keep" description="Per folder, from 1 to 100." error={error}>
        <Input
          type="number"
          min={1}
          max={100}
          step={1}
          value={draft}
          invalid={Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
    </SettingsCard>
  );
};
