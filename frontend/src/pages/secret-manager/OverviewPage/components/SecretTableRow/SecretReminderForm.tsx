import { useCallback, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Calendar,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  UnstableInput
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { useCreateReminder, useDeleteReminder } from "@app/hooks/api/reminders";
import { reminderKeys } from "@app/hooks/api/reminders/queries";
import { Reminder } from "@app/hooks/api/reminders/types";
import { secretKeys } from "@app/hooks/api/secrets/queries";

const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;
const DEFAULT_REPEAT_DAYS = 30;
const ONE_DAY_IN_MILLIS = 86400000;

enum ReminderType {
  Recurring = "Recurring",
  OneTime = "One Time"
}

const formSchema = z
  .object({
    reminderType: z.enum(["Recurring", "One Time"]),
    message: z.string().optional().nullable(),
    recipients: z.array(z.object({ label: z.string(), value: z.string().uuid() })).optional(),
    repeatDays: z
      .number()
      .min(MIN_REPEAT_DAYS, { message: `Must be at least ${MIN_REPEAT_DAYS} day` })
      .max(MAX_REPEAT_DAYS, { message: `Must be less than ${MAX_REPEAT_DAYS} days` })
      .nullable()
      .optional(),
    nextReminderDate: z.coerce.date().nullable().optional(),
    fromDate: z.coerce.date().nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (data.reminderType === "One Time") {
      if (!data.nextReminderDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Reminder date is required",
          path: ["nextReminderDate"]
        });
      } else if (data.nextReminderDate <= new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Reminder date must be in the future",
          path: ["nextReminderDate"]
        });
      }
    }

    if (data.reminderType === "Recurring") {
      if (!data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start date is required",
          path: ["fromDate"]
        });
      } else if (data.fromDate <= new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start date must be in the future",
          path: ["fromDate"]
        });
      }
    }
  });

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  secretId: string;
  secretKey: string;
  environment: string;
  secretPath: string;

  reminder?: Reminder;
  onClose?: () => void;
};

export const SecretReminderForm = ({
  secretId,
  secretKey,
  environment,
  secretPath,
  reminder,
  onClose
}: Props) => {
  const queryClient = useQueryClient();
  const { projectId, currentProject } = useProject();
  const { permission } = useProjectPermission();

  const { mutateAsync: createReminder, isPending: isCreating } = useCreateReminder(secretId);
  const { mutateAsync: deleteReminder, isPending: isDeleting } = useDeleteReminder(secretId);
  const { data: members = [] } = useGetWorkspaceUsers(currentProject?.id);

  const isEditMode = Boolean(reminder);

  const canEditSecret = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: ["*"]
    })
  );

  const memberOptions = useMemo(
    () =>
      members.map((member) => ({
        label: member.user.username || member.user.email,
        value: member.user.id
      })),
    [members]
  );

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    defaultValues: {
      reminderType: reminder?.repeatDays ? ReminderType.Recurring : ReminderType.OneTime,
      repeatDays: reminder?.repeatDays || null,
      message: reminder?.message || "",
      nextReminderDate: reminder?.nextReminderDate || null,
      fromDate: reminder?.fromDate || null,
      recipients: []
    },
    resolver: zodResolver(formSchema)
  });

  const reminderType = watch("reminderType");
  const fromDate = watch("fromDate");

  useEffect(() => {
    if (!reminder || !memberOptions.length) return;

    if (reminder.recipients?.length) {
      const selectedRecipients = memberOptions.filter((option) =>
        reminder.recipients!.includes(option.value)
      );
      setValue("recipients", selectedRecipients, { shouldDirty: false });
    }
  }, [reminder, memberOptions, setValue]);

  const isPending = isCreating || isDeleting;

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: reminderKeys.getReminder(secretId)
    });
  }, [queryClient, projectId, secretPath, environment, secretId]);

  const handleReminderTypeChange = useCallback(
    (newType: string) => {
      if (newType === ReminderType.Recurring) {
        setValue("repeatDays", DEFAULT_REPEAT_DAYS);
        setValue("nextReminderDate", null);
        setValue("fromDate", null);
      } else if (newType === ReminderType.OneTime) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setValue("nextReminderDate", tomorrow);
        setValue("repeatDays", null);
      }
    },
    [setValue]
  );

  const onSubmit = async (data: TFormSchema) => {
    await createReminder({
      repeatDays: data.repeatDays,
      message: data.message,
      recipients: data.recipients?.map((r) => r.value) || [],
      secretId,
      nextReminderDate: data.nextReminderDate,
      fromDate: data.fromDate
    });

    invalidateQueries();

    createNotification({
      type: "success",
      text: `Successfully ${isEditMode ? "updated" : "created"} secret reminder`
    });

    reset();
    onClose?.();
  };

  const handleDeleteReminder = async () => {
    await deleteReminder({ reminderId: reminder?.id || "", secretId });
    invalidateQueries();
    reset();
    onClose?.();

    createNotification({
      type: "success",
      text: "Successfully deleted reminder"
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <p className="text-sm font-medium">{isEditMode ? "Update" : "Create"} Reminder</p>
        <p className="mt-1 text-xs text-accent">
          Set up a reminder for when this secret should be rotated.
        </p>
      </div>

      <Field>
        <FieldLabel className="text-xs">Recurrence</FieldLabel>
        <FieldContent>
          <Controller
            name="reminderType"
            control={control}
            render={({ field: { value, onChange } }) => (
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  handleReminderTypeChange(val);
                }}
                disabled={!canEditSecret}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ReminderType).map((type) => (
                    <SelectItem value={type} key={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldContent>
      </Field>

      {reminderType === ReminderType.Recurring ? (
        <div className="flex items-start gap-3">
          <Field className="flex-1">
            <FieldLabel className="text-xs">Interval (days)</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="repeatDays"
                render={({ field, fieldState: { error } }) => (
                  <>
                    <UnstableInput
                      type="number"
                      placeholder={DEFAULT_REPEAT_DAYS.toString()}
                      value={field.value || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setValue("repeatDays", Number.isNaN(val) ? null : val);
                      }}
                      min={MIN_REPEAT_DAYS}
                      max={MAX_REPEAT_DAYS}
                      disabled={!canEditSecret}
                    />
                    {error ? (
                      <FieldError errors={[error]} />
                    ) : (
                      <FieldDescription className={field.value ? "opacity-100" : "opacity-0"}>
                        Every {field.value && field.value > 1 ? `${field.value} days` : "day"}
                        {fromDate ? ` from ${format(fromDate, "MM/dd/yy")}` : ""}
                      </FieldDescription>
                    )}
                  </>
                )}
              />
            </FieldContent>
          </Field>
          <Field className="flex-1">
            <FieldLabel className="text-xs">Start Date</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="fromDate"
                render={({ field, fieldState: { error } }) => (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          data-empty={!field.value}
                          className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
                          isDisabled={!canEditSecret}
                        >
                          <CalendarIcon className="mr-2 size-4" />
                          {field.value ? format(field.value, "P") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={{ before: new Date(Date.now() + ONE_DAY_IN_MILLIS) }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FieldError errors={[error]} />
                  </>
                )}
              />
            </FieldContent>
          </Field>
        </div>
      ) : (
        <Field>
          <FieldLabel className="text-xs">Reminder Date</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name="nextReminderDate"
              render={({ field, fieldState: { error } }) => (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        data-empty={!field.value}
                        className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
                        isDisabled={!canEditSecret}
                      >
                        <CalendarIcon className="mr-2 size-4" />
                        {field.value ? format(field.value, "P") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value || undefined}
                        onSelect={field.onChange}
                        disabled={{ before: new Date(Date.now() + ONE_DAY_IN_MILLIS) }}
                      />
                    </PopoverContent>
                  </Popover>
                  <FieldError errors={[error]} />
                </>
              )}
            />
          </FieldContent>
        </Field>
      )}

      <Field>
        <FieldLabel className="text-xs">Note</FieldLabel>
        <FieldContent>
          <Controller
            name="message"
            control={control}
            render={({ field }) => (
              <TextArea
                {...field}
                value={field.value ?? ""}
                placeholder="Remember to rotate this secret every month."
                className="max-h-32 min-h-16 resize-none"
                disabled={!canEditSecret}
              />
            )}
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel className="text-xs">Recipients</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="recipients"
            render={({ field }) => (
              <FilterableSelect
                menuPlacement="top"
                className="w-full"
                placeholder="Select recipients..."
                isMulti
                name="recipients"
                options={memberOptions}
                value={field.value}
                onChange={field.onChange}
                isDisabled={!canEditSecret}
              />
            )}
          />
          <FieldDescription>
            If none selected, all project members will be notified.
          </FieldDescription>
        </FieldContent>
      </Field>

      {!canEditSecret && (
        <p className="mt-2 text-xs text-muted">
          You do not have permission to manage reminders on this secret.
        </p>
      )}

      <div className="flex justify-end gap-2">
        {isEditMode && canEditSecret && (
          <Button
            variant="danger"
            size="xs"
            type="button"
            onClick={handleDeleteReminder}
            isDisabled={isPending}
            isPending={isDeleting}
          >
            <TrashIcon />
            Delete
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="xs" type="button" onClick={onClose}>
          Close
        </Button>
        {canEditSecret && (
          <Button
            variant="project"
            size="xs"
            type="submit"
            isDisabled={!isDirty || isPending}
            isPending={isCreating}
          >
            {isEditMode ? "Update" : "Create"} Reminder
          </Button>
        )}
      </div>
    </form>
  );
};
