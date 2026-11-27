import { useMemo, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Inline } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { slugSchema } from "@app/lib/schemas/slugSchema";

import { readableValue, type Secret } from "../../secrets-model";
import { type Entry, SecretEntryFields } from "../flows/create-secret-flow";
import { ConfirmDependentsDialog } from "./confirm-dependents-dialog";
import { useDependents } from "./references-dialog";
import type { SecretPatch } from "./types";

import flowStyles from "../flows/flows.module.css";

const toEntry = (secret: Secret): Entry => ({
  id: secret.id,
  key: secret.name,
  value: readableValue(secret) ?? "",
  comment: secret.comment,
  skipMultilineEncoding: Boolean(secret.skipMultilineEncoding),
  tags: secret.tags,
  metadata: secret.metadata.map((item) => ({
    id: crypto.randomUUID(),
    key: item.key,
    value: item.value,
    isEncrypted: item.encrypted
  }))
});

export function EditSecretSheet({
  secret,
  environmentLabel,
  tagOptions,
  title = "Edit secret",
  saveLabel = "Save changes",
  canCreateTags,
  onClose,
  onSave
}: {
  secret: Secret;
  environmentLabel: string;
  tagOptions: string[];
  title?: string;
  saveLabel?: string;
  canCreateTags: boolean;
  onClose: () => void;
  onSave: (patch: SecretPatch) => Promise<boolean>;
}) {
  const { dependents, isPending: dependentsPending } = useDependents(secret);
  const initial = useMemo(() => toEntry(secret), [secret]);
  const [entry, setEntry] = useState(initial);
  const [createdTags, setCreatedTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<SecretPatch>();
  const [saving, setSaving] = useState(false);
  const metadata = (list: Entry["metadata"]) =>
    list.map(({ key, value, isEncrypted }) => ({ key, value, encrypted: isEncrypted }));
  const patch: SecretPatch = {
    ...(entry.value !== initial.value ? { value: entry.value } : {}),
    ...(entry.comment !== initial.comment ? { comment: entry.comment } : {}),
    ...(JSON.stringify(entry.tags) !== JSON.stringify(initial.tags) ? { tags: entry.tags } : {}),
    ...(JSON.stringify(metadata(entry.metadata)) !== JSON.stringify(secret.metadata)
      ? { metadata: metadata(entry.metadata) }
      : {}),
    ...(entry.skipMultilineEncoding !== initial.skipMultilineEncoding
      ? { skipMultilineEncoding: entry.skipMultilineEncoding }
      : {})
  };
  const dirty = Object.keys(patch).length > 0;
  const checking = patch.value !== undefined && dependentsPending;
  const options = [...new Set([...tagOptions, ...createdTags, ...entry.tags])]
    .sort()
    .map((tag) => ({ value: tag, label: tag }));
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });
  const save = async (next: SecretPatch) => {
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };
  const submit = () => {
    const issues: Record<string, string> = {};
    entry.metadata.forEach((item) => {
      if (!item.key) issues[`${entry.id}.metadata.${item.id}`] = "Key is required";
    });
    setErrors(issues);
    if (Object.keys(issues).length || !dirty || checking) return;
    if (patch.value !== undefined && dependents.length) {
      setConfirm(patch);
      return;
    }
    save(patch);
  };
  return (
    <>
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next) requestDiscard();
        }}
      >
        <SheetContent size="md" pending={saving}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{`Changes apply to ${environmentLabel} only.`}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <form
              id="edit-secret-sheet"
              noValidate
              className={flowStyles.form}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            >
              <Field label="Environment">
                <MultiSelect
                  label="Environment"
                  options={[{ value: secret.environment, label: environmentLabel }]}
                  value={[secret.environment]}
                  disabled
                />
              </Field>
              <SecretEntryFields
                entry={entry}
                index={0}
                errors={errors}
                tagOptions={options}
                editing={{ valueCleared: patch.value !== undefined && !entry.value }}
                scope={secret}
                onPatch={(value) => setEntry((current) => ({ ...current, ...value }))}
                onClearError={(key) =>
                  setErrors((current) => {
                    const rest = { ...current };
                    delete rest[key];
                    return rest;
                  })
                }
                onCreateTag={
                  canCreateTags
                    ? (query) => {
                        const parsed = slugSchema().safeParse(query.trim());
                        if (!parsed.success) return;
                        setCreatedTags((current) => [...current, parsed.data]);
                        setEntry((current) => ({
                          ...current,
                          tags: [...current.tags, parsed.data]
                        }));
                      }
                    : undefined
                }
              />
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button type="button" variant="ghost" onClick={requestDiscard}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-secret-sheet"
                disabled={!dirty || saving}
                loading={saving || checking}
              >
                {saveLabel}
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog {...discardDialogProps} />
      <ConfirmDependentsDialog
        open={Boolean(confirm)}
        dependents={dependents}
        pending={saving}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
        onConfirm={() => confirm && save(confirm)}
      />
    </>
  );
}
