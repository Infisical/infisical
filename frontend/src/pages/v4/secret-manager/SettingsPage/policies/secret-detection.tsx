import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";

import type { Project } from "@app/hooks/api/projects/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

import styles from "./policies.module.css";

type Entry = { key: number; value: string };

let nextKey = 0;
const entriesOf = (values: string[]): Entry[] =>
  (values.length ? values : [""]).map((value) => {
    nextKey += 1;
    return { key: nextKey, value };
  });

export const SecretDetectionSection = ({
  project,
  lockedReason
}: {
  project: Project;
  lockedReason?: string;
}) => {
  const updateProject = useV4Adapter("projectSettings").useUpdateProject();
  const [savedValues, setSavedValues] = useState(project.secretDetectionIgnoreValues ?? []);
  const [entries, setEntries] = useState(() => entriesOf(savedValues));
  const [submitted, setSubmitted] = useState(false);
  const initial = savedValues.length ? savedValues : [""];
  const dirty =
    entries.length !== initial.length ||
    entries.some((entry, index) => entry.value !== initial[index]);
  const errorOf = (entry: Entry) =>
    submitted && !entry.value.trim() ? "Enter a secret value" : undefined;
  return (
    <SettingsCard
      title="Secret detection"
      description="Values to ignore when scanning parameter folders, so approved values don't trigger policy violation alerts."
      dirty={dirty}
      locked={lockedReason}
      onDiscard={() => {
        setEntries(entriesOf(savedValues));
        setSubmitted(false);
      }}
      onSave={async () => {
        setSubmitted(true);
        if (entries.some((entry) => !entry.value.trim()))
          throw new Error("Fill in or remove the empty values, then save again.");
        const values = entries.map((entry) => entry.value.trim());
        await updateProject.mutateAsync({
          projectId: project.id,
          secretDetectionIgnoreValues: values
        });
        setSavedValues(values);
        setEntries(entriesOf(values));
        setSubmitted(false);
        saved("Secret detection ignore values updated");
      }}
    >
      <Stack gap={8} align="start">
        {entries.map((entry, index) => (
          <div key={entry.key} className={styles.valueRow}>
            <Field label={index === 0 ? "Secret value" : undefined} error={errorOf(entry)} wide>
              <Input
                aria-label={index === 0 ? undefined : "Secret value"}
                placeholder="sk-1234567890abcdef"
                autoComplete="off"
                value={entry.value}
                invalid={Boolean(errorOf(entry))}
                onChange={(event) =>
                  setEntries((current) =>
                    current.map((item) =>
                      item.key === entry.key ? { ...item, value: event.target.value } : item
                    )
                  )
                }
              />
            </Field>
            <div className={index === 0 ? styles.firstRowAction : undefined}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon="trash"
                iconOnly
                onClick={() =>
                  setEntries((current) => current.filter((item) => item.key !== entry.key))
                }
              >
                Remove value
              </Button>
            </div>
          </div>
        ))}
        <Inline gap={8}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon="plus"
            onClick={() => setEntries((current) => [...current, ...entriesOf([""])])}
          >
            Add value
          </Button>
        </Inline>
      </Stack>
    </SettingsCard>
  );
};
