import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { TagsInput } from "@infisical/cipher/ui/tags-input";

import { isValidEmail } from "@app/helpers/email";

import { readableFailure, saved } from "../../../access/toast";

export type ReportOption<TType extends string> = {
  type: TType;
  label: string;
  description: string;
};

export const GenerateReportDialog = <TType extends string>({
  options,
  maxRecipients,
  onSubmit,
  onClose
}: {
  options: ReportOption<TType>[];
  maxRecipients?: number;
  onSubmit: (request: { types: TType[]; emailRecipients?: string[] }) => Promise<unknown>;
  onClose: () => void;
}) => {
  const [types, setTypes] = useState<TType[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const submitting = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: types.length > 0 || recipients.length > 0,
    onDiscard: onClose
  });
  const selectedTypes = new Set(types);
  const allSelected = types.length === options.length;

  const submit = async () => {
    submitting.current = true;
    try {
      await onSubmit({
        types: options.filter((option) => selectedTypes.has(option.type)).map(({ type }) => type),
        emailRecipients: recipients.length ? recipients : undefined
      }).catch(readableFailure("Couldn't request the report."));
      saved("Report requested. Recipients get an email once it's ready.");
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title="Generate Report"
        description="The reports are emailed as CSV attachments once ready."
        open
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel="Generate Report"
        onComplete={submit}
        steps={[
          {
            title: "Reports",
            disabledReason: types.length ? undefined : "Select at least one report",
            content: (
              <Stack gap={24}>
                <FieldSet
                  legend="Reports"
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTypes(allSelected ? [] : options.map(({ type }) => type))}
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </Button>
                  }
                >
                  <Stack gap={12}>
                    {options.map((option) => (
                      <Checkbox
                        key={option.type}
                        label={option.label}
                        description={option.description}
                        checked={selectedTypes.has(option.type)}
                        onChange={(checked) =>
                          setTypes((current) =>
                            checked
                              ? [...current, option.type]
                              : current.filter((type) => type !== option.type)
                          )
                        }
                      />
                    ))}
                  </Stack>
                </FieldSet>
                <Field
                  label="Email recipients"
                  optional
                  description="Defaults to your own email when left blank."
                >
                  <TagsInput
                    label="Email recipients"
                    placeholder="auditor@example.com"
                    value={recipients}
                    onValueChange={setRecipients}
                    validate={(tag, current) => {
                      if (!isValidEmail(tag)) return "Enter a valid email address";
                      if (current.includes(tag)) return "This recipient is already added";
                      if (maxRecipients && current.length >= maxRecipients)
                        return `Add up to ${maxRecipients} recipients`;
                      return undefined;
                    }}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your report selection and recipients will be lost."
      />
    </>
  );
};
