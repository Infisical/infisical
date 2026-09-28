import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  TextArea,
  Toggle
} from "@app/components/v3";
import { useProject, useUser } from "@app/context";
import {
  AlertChannelType,
  AlertPrincipalType,
  AlertResourceType,
  channelFormSchema,
  SecretReminderEventType,
  SecretReminderRecurrence,
  TAlert,
  toChannelForm,
  toChannelInput,
  TSecretReminderCondition,
  useCreateAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { getReminderCondition } from "./secret-reminder-fns";

const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;
const DEFAULT_REPEAT_DAYS = 30;
const DEFAULT_REMINDER_NAME = "Rotation reminder";

const RECURRENCE_LABELS: Record<SecretReminderRecurrence, string> = {
  [SecretReminderRecurrence.Recurring]: "Recurring",
  [SecretReminderRecurrence.OneTime]: "One Time"
};

const tomorrow = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date;
};

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255),
    recurrence: z.nativeEnum(SecretReminderRecurrence),
    repeatDays: z.number().or(z.nan()).nullable(),
    startDate: z.date({ required_error: "Pick a date" }),
    note: z.string().max(1000).optional(),
    enabled: z.boolean(),
    channels: z.array(channelFormSchema).min(1, "At least one channel is required")
  })
  .superRefine((form, ctx) => {
    if (form.recurrence !== SecretReminderRecurrence.Recurring) return;
    const days = form.repeatDays;
    if (days === null || Number.isNaN(days)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatDays"],
        message: "Enter a number"
      });
    } else if (!Number.isInteger(days) || days < MIN_REPEAT_DAYS || days > MAX_REPEAT_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatDays"],
        message: `Must be a whole number from ${MIN_REPEAT_DAYS} to ${MAX_REPEAT_DAYS}`
      });
    }
  });

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  secretId: string;
  reminder?: TAlert;
  onComplete: () => void;
  onCancel: () => void;
};

export const SecretReminderForm = ({ secretId, reminder, onComplete, onCancel }: Props) => {
  const { projectId } = useProject();
  const { user } = useUser();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const isEditing = Boolean(reminder);
  const condition = reminder ? getReminderCondition(reminder) : null;

  const formMethods = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: reminder?.name ?? DEFAULT_REMINDER_NAME,
      recurrence: condition?.recurrence ?? SecretReminderRecurrence.Recurring,
      repeatDays: condition?.repeatDays ?? DEFAULT_REPEAT_DAYS,
      startDate: condition ? new Date(condition.startDate) : tomorrow(),
      note: condition?.note ?? "",
      enabled: reminder?.enabled ?? true,
      // New reminders start with the creator on email, which is the closest match to how reminders
      // were delivered before channels existed.
      channels: reminder
        ? reminder.channels.map(toChannelForm)
        : [
            {
              channelType: AlertChannelType.Email,
              name: "Email",
              enabled: true,
              recipients: [{ principalType: AlertPrincipalType.User, principalId: user.id }],
              webhookUrl: "",
              url: "",
              signingSecret: "",
              integrationKey: ""
            }
          ]
    }
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = formMethods;

  const recurrence = useWatch({ control, name: "recurrence" });
  const repeatDays = useWatch({ control, name: "repeatDays" });
  const startDate = useWatch({ control, name: "startDate" });
  const isRecurring = recurrence === SecretReminderRecurrence.Recurring;

  const onSubmit = async (data: TFormSchema) => {
    const reminderCondition: TSecretReminderCondition = {
      recurrence: data.recurrence,
      startDate: format(data.startDate, "yyyy-MM-dd"),
      repeatDays: isRecurring ? data.repeatDays : null,
      note: data.note || null
    };
    const channels = data.channels.map(toChannelInput);

    try {
      if (reminder) {
        await updateAlert.mutateAsync({
          alertId: reminder.id,
          name: data.name,
          enabled: data.enabled,
          condition: reminderCondition,
          channels
        });
        createNotification({ text: `Reminder "${data.name}" updated`, type: "success" });
      } else {
        await createAlert.mutateAsync({
          name: data.name,
          resourceType: AlertResourceType.SecretReminder,
          resourceId: secretId,
          eventType: SecretReminderEventType.Due,
          condition: reminderCondition,
          enabled: data.enabled,
          projectId,
          channels
        });
        createNotification({ text: `Reminder "${data.name}" created`, type: "success" });
      }
      onComplete();
    } catch {
      // MutationCache reports request errors globally; keep the form open for another attempt.
    }
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex flex-col gap-5 p-4">
          <Field>
            <FieldLabel htmlFor="reminder-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="reminder-name"
                autoFocus
                placeholder={DEFAULT_REMINDER_NAME}
                isError={Boolean(errors.name)}
                autoComplete="off"
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>

          <div className="flex flex-col gap-3">
            <Label>Schedule</Label>
            <Controller
              control={control}
              name="recurrence"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(SecretReminderRecurrence).map((value) => (
                      <SelectItem key={value} value={value}>
                        {RECURRENCE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <div className="flex items-start gap-3">
              {isRecurring && (
                <Field className="flex-1">
                  <FieldLabel htmlFor="reminder-repeat-days" className="text-xs">
                    Interval (days)
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="reminder-repeat-days"
                      type="number"
                      min={MIN_REPEAT_DAYS}
                      max={MAX_REPEAT_DAYS}
                      isError={Boolean(errors.repeatDays)}
                      {...register("repeatDays", { valueAsNumber: true })}
                    />
                    <FieldError errors={[errors.repeatDays]} />
                  </FieldContent>
                </Field>
              )}
              <Controller
                control={control}
                name="startDate"
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel className="text-xs">
                      {isRecurring ? "Starting On" : "Date"}
                    </FieldLabel>
                    <FieldContent>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="size-4" />
                            {field.value ? format(field.value, "PP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => date && field.onChange(date)}
                            disabled={{ before: tomorrow() }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
            {startDate && (
              <FieldDescription>
                {isRecurring && repeatDays && !Number.isNaN(repeatDays)
                  ? `Sends every ${repeatDays === 1 ? "day" : `${repeatDays} days`}, starting ${format(startDate, "PP")}.`
                  : `Sends once on ${format(startDate, "PP")}.`}
              </FieldDescription>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="reminder-note">
              Note <span className="text-muted">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <TextArea
                id="reminder-note"
                rows={3}
                placeholder="Rotate this key and update the payments service."
                isError={Boolean(errors.note)}
                {...register("note")}
              />
              <FieldDescription>
                Included in every notification this reminder sends.
              </FieldDescription>
              <FieldError errors={[errors.note]} />
            </FieldContent>
          </Field>

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Label
                htmlFor="reminder-enabled"
                className="cursor-pointer justify-between rounded-md border border-border px-3 py-2.5 font-normal"
              >
                Enabled
                <Toggle
                  id="reminder-enabled"
                  variant="project"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Label>
            )}
          />

          <ChannelsField
            projectId={projectId}
            resourceType={AlertResourceType.SecretReminder}
            resourceId={secretId}
          />
        </div>

        <SheetFooter className="sticky bottom-0 border-t bg-popover">
          <Button
            type="submit"
            variant="project"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            {isEditing ? "Update Reminder" : "Create Reminder"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
