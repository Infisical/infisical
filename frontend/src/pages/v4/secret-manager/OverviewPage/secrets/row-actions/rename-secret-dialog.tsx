import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

export function RenameSecretDialog({
  name,
  environmentCount,
  autoCapitalize,
  onRename,
  onClose
}: {
  name: string;
  environmentCount: number;
  autoCapitalize: boolean;
  onRename: (name: string, onFieldError: (message: string) => void) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const completed = useRef(false);
  const next = draft.trim();
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: next !== name,
    onDiscard: onClose
  });
  const submit = async () => {
    let fieldError: string | undefined;
    const ok = await onRename(next, (message) => {
      fieldError = message;
    });
    if (fieldError) return { fields: { name: fieldError } };
    if (!ok) return false;
    completed.current = true;
    onClose();
    return true;
  };
  return (
    <>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => {
          if (open) return;
          if (completed.current) onClose();
          else requestDiscard();
        }}
        title="Edit secret name"
        completeLabel="Rename"
        onComplete={submit}
        steps={[
          {
            title: "Name",
            disabledReason: next === name ? "No changes to save" : undefined,
            validate: () => (next ? true : { fields: { name: "Enter a secret name" } }),
            content: (
              <Field
                label="Name"
                name="name"
                description={
                  environmentCount > 1
                    ? `Renames the secret in ${environmentCount} environments.`
                    : undefined
                }
              >
                <Input
                  value={draft}
                  autoComplete="off"
                  onChange={(event) =>
                    setDraft(autoCapitalize ? event.target.value.toUpperCase() : event.target.value)
                  }
                />
              </Field>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
}
