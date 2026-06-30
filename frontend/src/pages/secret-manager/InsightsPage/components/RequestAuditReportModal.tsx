import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { AuditReportType, useRequestAuditReport } from "@app/hooks/api/auditReports";

import {
  AUDIT_REPORT_TYPE_DESCRIPTIONS,
  AUDIT_REPORT_TYPE_LABELS,
  AUDIT_REPORT_TYPES_ORDERED
} from "./auditReportMeta";

const parseEmails = (raw?: string): string[] =>
  (raw ?? "")
    .split(/[\s,]+/)
    .map((email) => email.trim())
    .filter(Boolean);

const formSchema = z.object({
  reportTypes: z.nativeEnum(AuditReportType).array().min(1, "Select at least one report type"),
  emailRecipients: z
    .string()
    .optional()
    .refine(
      (value) => parseEmails(value).every((email) => z.string().email().safeParse(email).success),
      {
        message: "Enter valid, comma-separated email addresses"
      }
    )
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const RequestAuditReportModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  const requestAuditReport = useRequestAuditReport();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: { reportTypes: [...AUDIT_REPORT_TYPES_ORDERED], emailRecipients: "" }
  });

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const onSubmit = async (data: TFormSchema) => {
    const recipients = parseEmails(data.emailRecipients);
    try {
      await requestAuditReport.mutateAsync({
        projectId,
        reports: data.reportTypes.map((type) => ({ type })),
        emailRecipients: recipients.length ? recipients : undefined
      });
      createNotification({
        type: "success",
        text: "Report requested. Recipients will receive an email once it's ready."
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to request report. Please try again.";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Audit Report</DialogTitle>
          <DialogDescription>
            Select the reports to generate. They will be emailed as CSV attachments once ready.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="reportTypes"
            render={({ field, fieldState: { error } }) => {
              const allSelected = field.value.length === AUDIT_REPORT_TYPES_ORDERED.length;
              return (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Reports</FieldLabel>
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-medium text-muted transition-colors hover:text-mineshaft-300"
                      onClick={() =>
                        field.onChange(allSelected ? [] : [...AUDIT_REPORT_TYPES_ORDERED])
                      }
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <FieldContent>
                    <div className="flex flex-col gap-3">
                      {AUDIT_REPORT_TYPES_ORDERED.map((type) => {
                        const checkboxId = `audit-report-type-${type}`;
                        return (
                          <div key={type} className="flex items-start gap-3">
                            <Checkbox
                              id={checkboxId}
                              variant="project"
                              className="mt-0.5"
                              isChecked={field.value.includes(type)}
                              onCheckedChange={(isChecked) => {
                                if (isChecked) field.onChange([...field.value, type]);
                                else field.onChange(field.value.filter((value) => value !== type));
                              }}
                            />
                            <label htmlFor={checkboxId} className="cursor-pointer leading-tight">
                              <span className="block text-sm text-foreground">
                                {AUDIT_REPORT_TYPE_LABELS[type]}
                              </span>
                              <span className="block text-xs text-muted">
                                {AUDIT_REPORT_TYPE_DESCRIPTIONS[type]}
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              );
            }}
          />
          <Controller
            control={control}
            name="emailRecipients"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Email recipients</FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    isError={Boolean(error)}
                    placeholder="auditor@example.com, compliance@example.com"
                  />
                  <FieldDescription>
                    Comma-separated emails. Defaults to your own email when left blank.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Generate Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
