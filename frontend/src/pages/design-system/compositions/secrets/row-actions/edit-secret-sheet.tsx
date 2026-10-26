import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { readableValue, type Secret } from "../../secrets-model";
import { type Entry, SecretEntryFields } from "../flows/create-secret-flow";
import { DiscardDialog } from "../flows/shared";
import type { SecretPatch } from "./types";

import flowStyles from "../flows/flows.module.css";
import styles from "./row-actions.module.css";

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
  dependents,
  onClose,
  onSave
}: {
  secret: Secret;
  environmentLabel: string;
  tagOptions: string[];
  dependents: Secret[];
  onClose: () => void;
  onSave: (patch: SecretPatch) => void;
}) {
  const initial = useMemo(() => toEntry(secret), [secret]);
  const [entry, setEntry] = useState(initial);
  const [createdTags, setCreatedTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const [confirm, setConfirm] = useState<SecretPatch>();
  const [typed, setTyped] = useState("");
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
  const options = [...new Set([...tagOptions, ...createdTags, ...entry.tags])]
    .sort()
    .map((tag) => ({ value: tag, label: tag }));
  const close = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  const submit = () => {
    const issues: Record<string, string> = {};
    entry.metadata.forEach((item) => {
      if (!item.key) issues[`${entry.id}.metadata.${item.id}`] = "Key is required";
    });
    setErrors(issues);
    if (Object.keys(issues).length || !dirty) return;
    if (patch.value !== undefined && dependents.length) {
      setTyped("");
      setConfirm(patch);
      return;
    }
    onSave(patch);
  };
  return (
    <>
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <SheetContent className={flowStyles.secretSheet}>
          <SheetHeader>
            <SheetTitle>Edit secret</SheetTitle>
            <SheetDescription>{`Update this secret in ${environmentLabel}.`}</SheetDescription>
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
                onPatch={(value) => setEntry((current) => ({ ...current, ...value }))}
                onClearError={(key) =>
                  setErrors((current) => {
                    const rest = { ...current };
                    delete rest[key];
                    return rest;
                  })
                }
                onCreateTag={(query) => {
                  const parsed = slugSchema().safeParse(query.trim());
                  if (!parsed.success) return;
                  setCreatedTags((current) => [...current, parsed.data]);
                  setEntry((current) => ({ ...current, tags: [...current.tags, parsed.data] }));
                }}
              />
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" form="edit-secret-sheet" disabled={!dirty}>
                Save changes
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardDialog
        open={discard}
        description="Your unsaved changes to this secret will be lost."
        onKeep={() => setDiscard(false)}
        onDiscard={() => {
          setDiscard(false);
          onClose();
        }}
      />
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      >
        <AlertDialogContent icon="alert">
          <AlertDialogHeader>
            <AlertDialogTitle>Update this secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This secret is referenced by other secrets in your project. Saving these changes will
              update everywhere it&apos;s referenced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className={styles.dependentList}>
            {dependents.map((dependent) => (
              <li key={dependent.id}>
                <code>{dependent.name}</code>
                <span className={styles.muted}>{`${dependent.environment} ${dependent.path}`}</span>
              </li>
            ))}
          </ul>
          <Field label="Type confirm to confirm">
            <Input
              mono
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={typed !== "confirm"}
              onClick={() => confirm && onSave(confirm)}
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
