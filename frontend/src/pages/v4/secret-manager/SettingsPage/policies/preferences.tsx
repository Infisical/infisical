import { useState } from "react";

import { Card } from "@app/components/v4/ui/card";
import { Switch } from "@app/components/v4/ui/switch";
import type { Project, UpdateProjectDTO } from "@app/hooks/api/projects/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

type PreferenceKey =
  | "autoCapitalization"
  | "enforceEncryptedSecretManagerSecretMetadata"
  | "secretSharing";

const PREFERENCES: {
  key: PreferenceKey;
  title: string;
  description: string;
  label: string;
  fallback: boolean;
}[] = [
  {
    key: "autoCapitalization",
    title: "Enforce capitalization",
    description: "Secret keys are saved in uppercase.",
    label: "Auto capitalization",
    fallback: false
  },
  {
    key: "enforceEncryptedSecretManagerSecretMetadata",
    title: "Enforce encrypted metadata",
    description:
      "Secrets can only have encrypted metadata. Unencrypted metadata fields are rejected.",
    label: "Enforced encrypted metadata",
    fallback: false
  },
  {
    key: "secretSharing",
    title: "Allow secret sharing",
    description: "Members can securely share secrets with each other.",
    label: "Secret sharing",
    fallback: true
  }
];

const Preference = ({
  project,
  preference,
  disabled
}: {
  project: Project;
  preference: (typeof PREFERENCES)[number];
  disabled: boolean;
}) => {
  const updateProject = useV4Adapter("projectSettings").useUpdateProject();
  const [pending, setPending] = useState(false);
  return (
    <Card
      title={preference.title}
      description={preference.description}
      action={
        <Switch
          aria-label={preference.title}
          checked={project[preference.key] ?? preference.fallback}
          disabled={disabled || pending}
          onCheckedChange={async (state) => {
            setPending(true);
            try {
              await updateProject.mutateAsync({
                projectId: project.id,
                [preference.key]: state
              } as UpdateProjectDTO);
              saved(`${preference.label} turned ${state ? "on" : "off"}`);
            } finally {
              setPending(false);
            }
          }}
        />
      }
    />
  );
};

export const PreferencesSection = ({
  project,
  canEdit
}: {
  project: Project;
  canEdit: boolean;
}) => (
  <>
    {PREFERENCES.map((preference) => (
      <Preference
        key={preference.key}
        project={project}
        preference={preference}
        disabled={!canEdit}
      />
    ))}
  </>
);
