import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faClock, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DatePicker,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { useCreateReminder, useDeleteReminder } from "@app/hooks/api/reminders";
import { reminderKeys } from "@app/hooks/api/reminders/queries";
import { Reminder } from "@app/hooks/api/reminders/types";
import { secretKeys } from "@app/hooks/api/secrets/queries";

// Constants
const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;
const DEFAULT_REPEAT_DAYS = 30;
const DEFAULT_TEXTAREA_ROWS = 8;
const ONE_DAY_IN_MILLIS = 86400000;

// Enums
enum ReminderType {
  Recurring = "Recurring",
  OneTime = "One Time"
}

// Types
interface RecipientOption {
  label: string;
  value: string;
}

interface ReminderFormProps {
  isOpen: boolean;
  reminderId?: string;
  onOpenChange: () => void;
  projectId: string;
  environment: string;
  secretPath: string;
  secretId: string;
  reminder?: Reminder;
}

// Validation Schema
const ReminderFormSchema = z.object({
  message: z.string().optional().nullable(),
  recipients: z
    .array(
      z.object({
        label: z.string(),
        value: z.string().uuid()
      })
    )
    .optional(),
  repeatDays: z
    .number()
    .min(MIN_REPEAT_DAYS, { message: `Must be at least ${MIN_REPEAT_DAYS} day` })
    .max(MAX_REPEAT_DAYS, { message: `Must be less than ${MAX_REPEAT_DAYS} days` })
    .nullable()
    .optional(),
  nextReminderDate: z.coerce
    .date()
    .refine((data) => data > new Date(), { message: "Reminder date must be in the future" })
    .nullable()
    .optional(),
  fromDate: z.coerce
    .date()
    .refine((data) => data > new Date(), { message: "From date must be in the future" })
    .nullable()
    .optional(),
  reminderType: z.enum(["Recurring", "One Time"])
});

export type TReminderFormSchema = z.infer<typeof ReminderFormSchema>;

// Custom hook for form state management
const useReminderForm = (reminderData?: Reminder) => {
  const { repeatDays, message, nextReminderDate, fromDate } = reminderData || {};

  const isEditMode = Boolean(reminderData);

  const defaultValues = useMemo(
    () => ({
      repeatDays: repeatDays || null,
      message: message || "",
      nextReminderDate: nextReminderDate || null,
      reminderType: repeatDays ? ReminderType.Recurring : ReminderType.OneTime,
      recipients: [],
      fromDate
    }),
    [repeatDays, message, nextReminderDate, fromDate]
  );

  return {
    isEditMode,
    reminderData,
    defaultValues
  };
};

// Custom hook for workspace members
const useWorkspaceMembers = () => {
  const { currentProject } = useProject();
  const { data: members = [] } = useGetWorkspaceUsers(currentProject?.id);

  const memberOptions = useMemo(
    (): RecipientOption[] =>
      members.map((member) => ({
        label: member.user.username || member.user.email,
        value: member.user.id
      })),
    [members]
  );

  return { members, memberOptions };
};

// Main component
export const CreateReminderForm = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath,
  secretId,
  reminder
}: ReminderFormProps) => {
  const queryClient = useQueryClient();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Custom hooks
  const { isEditMode, reminderData } = useReminderForm(reminder);
  const { memberOptions } = useWorkspaceMembers();

  // API mutations
  const { mutateAsync: createReminder } = useCreateReminder(secretId);
  const { mutateAsync: deleteReminder } = useDeleteReminder(secretId);

  // Form setup
  const form = useForm<TReminderFormSchema>({
    defaultValues: {
      repeatDays: reminderData?.repeatDays || null,
      message: reminderData?.message || "",
      nextReminderDate: reminderData?.nextReminderDate || null,
      reminderType: reminderData?.repeatDays ? ReminderType.Recurring : ReminderType.OneTime,
      recipients: [],
      fromDate: reminderData?.fromDate
    },
    resolver: zodResolver(ReminderFormSchema)
  });

  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = form;

  // Watch form values
  const reminderType = watch("reminderType");
  const fromDate = watch("fromDate");

  // Invalidate queries helper
  const invalidateQueries = () => {
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.getDashboardSecrets({
        projectId,
        secretPath
      })
    });
    queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: reminderKeys.getReminder(secretId)
    });
  };

  // Form submission handler
  const handleFormSubmit = async (data: TReminderFormSchema) => {
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
    onOpenChange();
  };

  // Delete reminder handler
  const handleDeleteReminder = async () => {
    await deleteReminder({ reminderId: reminder?.id || "", secretId });
    invalidateQueries();
    reset();
    onOpenChange();

    createNotification({
      type: "success",
      text: "Successfully deleted reminder"
    });
  };

  // Handle reminder type change
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

  // Initialize form with existing data
  useEffect(() => {
    if (!reminderData) return;

    const {
      repeatDays: repeatDaysInitial,
      fromDate: fromDateInitial,
      message,
      recipients,
      nextReminderDate: nextReminderDateInitial
    } = reminderData;

    if (repeatDaysInitial) {
      setValue("repeatDays", repeatDaysInitial);
      setValue("fromDate", fromDateInitial);
      setValue("reminderType", ReminderType.Recurring);
    } else {
      setValue("reminderType", ReminderType.OneTime);
    }

    if (message) setValue("message", message);
    if (nextReminderDateInitial) setValue("nextReminderDate", nextReminderDateInitial);

    // Set recipients
    if (recipients?.length && memberOptions.length) {
      const selectedRecipients = memberOptions.filter((option) =>
        recipients.includes(option.value)
      );
      setValue("recipients", selectedRecipients);
    }
  }, [reminderData, memberOptions, setValue]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={`${isEditMode ? "Update" : "Create"} reminder`}
        subTitle="Set up a reminder for when this secret should be rotated. Everyone with access to this project will be notified when the reminder is triggered."
      >
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Reminder Type Selection */}
          <Controller
            name="reminderType"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Recurrence"
              >
                <Select
                  value={value}
                  onValueChange={(val) => {
                    onChange(val);
                    handleReminderTypeChange(val);
                  }}
                  className="w-full border border-mineshaft-500 capitalize"
                  position="popper"
                  placeholder="Select reminder recurrence"
                  dropdownContainerClassName="max-w-none"
                >
                  {Object.values(ReminderType).map((type) => (
                    <SelectItem value={type} key={type}>
                      {type}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          {/* Conditional Fields Based on Reminder Type */}
          {reminderType === ReminderType.Recurring ? (
            <div className="grid grid-cols-[1fr_auto] gap-x-2">
              <Controller
                control={control}
                name="repeatDays"
                render={({ field, fieldState }) => (
                  <div>
                    <FormControl
                      isRequired
                      className="mb-0"
                      label="Reminder Interval (in days)"
                      isError={Boolean(fieldState.error)}
                      errorText={fieldState.error?.message || ""}
                    >
                      <Input
                        onChange={(el) => {
                          const value = parseInt(el.target.value, 10);
                          setValue("repeatDays", Number.isNaN(value) ? null : value);
                        }}
                        type="number"
                        placeholder={DEFAULT_REPEAT_DAYS.toString()}
                        value={field.value || ""}
                        min={MIN_REPEAT_DAYS}
                        max={MAX_REPEAT_DAYS}
                      />
                    </FormControl>
                    {/* Interval description */}
                    <div
                      className={twMerge(
                        "mt-2 ml-1 text-xs",
                        field.value ? "opacity-60" : "opacity-0"
                      )}
                    >
                      A reminder will be sent every{" "}
                      {field.value && field.value > 1 ? `${field.value} days` : "day"}
                      {fromDate ? ` starting from ${format(fromDate, "MM/dd/yy")}` : ""}
                    </div>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="fromDate"
                render={({ field, fieldState }) => (
                  <FormControl
                    className="mb-0"
                    label="Start Date"
                    tooltipText="When enabled, this date will be used as the start date for the first reminder"
                    isError={Boolean(fieldState.error)}
                    errorText={fieldState.error?.message || ""}
                  >
                    <DatePicker
                      value={field.value || undefined}
                      className="w-full"
                      onChange={field.onChange}
                      dateFormat="P"
                      popUpProps={{
                        open: isDatePickerOpen,
                        onOpenChange: setIsDatePickerOpen
                      }}
                      popUpContentProps={{
                        align: "end"
                      }}
                      hideTime
                      disabled={{ before: new Date(Date.now() + ONE_DAY_IN_MILLIS) }}
                    />
                  </FormControl>
                )}
              />
            </div>
          ) : (
            <Controller
              control={control}
              name="nextReminderDate"
              render={({ field, fieldState }) => (
                <div>
                  <FormControl
                    isRequired
                    className="mb-0"
                    label="Reminder Date"
                    isError={Boolean(fieldState.error)}
                    errorText={fieldState.error?.message || ""}
                  >
                    <DatePicker
                      value={field.value || undefined}
                      className="w-full"
                      onChange={field.onChange}
                      dateFormat="P"
                      popUpProps={{
                        open: isDatePickerOpen,
                        onOpenChange: setIsDatePickerOpen
                      }}
                      popUpContentProps={{
                        align: "start"
                      }}
                      hideTime
                      disabled={{ before: new Date(Date.now() + ONE_DAY_IN_MILLIS) }}
                    />
                  </FormControl>
                </div>
              )}
            />
          )}

          {/* Message/Note Field */}
          <FormControl label="Note" className="mb-0">
            <TextArea
              placeholder="Remember to rotate the AWS secret every month."
              className="border border-mineshaft-600 text-sm"
              rows={DEFAULT_TEXTAREA_ROWS}
              reSize="none"
              cols={30}
              {...register("message")}
            />
          </FormControl>

          {/* Recipients Selection */}
          <Controller
            control={control}
            name="recipients"
            render={({ field }) => (
              <FormControl
                tooltipText={
                  <div>
                    Select users to receive reminders.
                    <br />
                    <br /> If none are selected, all project members will receive the reminder.
                  </div>
                }
                label="Recipients"
                className="mb-0"
              >
                <FilterableSelect
                  menuPlacement="top"
                  className="w-full"
                  placeholder="Select reminder recipients..."
                  isMulti
                  name="recipients"
                  options={memberOptions}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
            )}
          />

          {/* Action Buttons */}
          <div className="flex items-center space-x-4">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faClock} />}
              type="submit"
            >
              {isEditMode ? "Update" : "Create"} Reminder
            </Button>

            {isEditMode && (
              <Button
                onClick={handleDeleteReminder}
                colorSchema="danger"
                variant="outline"
                leftIcon={<FontAwesomeIcon icon={faTrash} />}
                type="button"
                isDisabled={isSubmitting}
              >
                Delete Reminder
              </Button>
            )}

            <Button
              onClick={onOpenChange}
              variant="plain"
              colorSchema="secondary"
              type="button"
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
