import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faClock, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetWorkspaceUsers } from "@app/hooks/api";

const ReminderFormSchema = z.object({
  note: z.string().optional().nullable(),
  recipients: z
    .array(
      z.object({
        label: z.string(),
        value: z.string().uuid()
      })
    )
    .optional(),
  days: z
    .number()
    .min(1, { message: "Must be at least 1 day" })
    .max(365, { message: "Must be less than 365 days" })
    .nullable()
});
export type TReminderFormSchema = z.infer<typeof ReminderFormSchema>;

interface ReminderFormProps {
  isOpen: boolean;
  repeatDays?: number | null;
  note?: string | null;
  recipients?: string[] | null;
  onOpenChange: (isOpen: boolean, data?: TReminderFormSchema) => void;
}

export const CreateReminderForm = ({
  isOpen,
  onOpenChange,
  repeatDays,
  note,
  recipients
}: ReminderFormProps) => {
  const { currentWorkspace } = useWorkspace();

  const { data: members = [] } = useGetWorkspaceUsers(currentWorkspace?.id);

  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TReminderFormSchema>({
    defaultValues: {
      days: repeatDays || undefined,
      note: note || ""
    },
    resolver: zodResolver(ReminderFormSchema)
  });

  const handleFormSubmit = async (data: TReminderFormSchema) => {
    onOpenChange(false, data);
  };

  useEffect(() => {
    // On initial load, filter the members to only include the recipients
    if (members.length) {
      const filteredMembers = members.filter((m) => recipients?.find((r) => r === m.user.id));
      setValue(
        "recipients",
        filteredMembers.map((m) => ({
          label: m.user.username || m.user.email,
          value: m.user.id
        }))
      );
    }
  }, [members, isOpen, recipients]);

  useEffect(() => {
    if (repeatDays) setValue("days", repeatDays);
    if (note) setValue("note", note);
  }, [repeatDays, note]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={`${repeatDays ? "Update" : "Create"} reminder`}
        subTitle="Set up a reminder for when this secret should be rotated. Everyone with access to this project will be notified when the reminder is triggered."
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="space-y-2">
            <div>
              <Controller
                control={control}
                name="days"
                render={({ field, fieldState }) => (
                  <>
                    <FormControl
                      isRequired
                      className="mb-0"
                      label="Reminder Interval (in days)"
                      isError={Boolean(fieldState.error)}
                      errorText={fieldState.error?.message || ""}
                    >
                      <Input
                        onChange={(el) => setValue("days", parseInt(el.target.value, 10))}
                        type="number"
                        placeholder="31"
                        defaultValue={repeatDays || undefined}
                        value={field.value || undefined}
                      />
                    </FormControl>
                    <div
                      className={twMerge(
                        "ml-1 mt-2 text-xs",
                        field.value ? "opacity-60" : "opacity-0"
                      )}
                    >
                      A reminder will be sent every{" "}
                      {field.value && field.value > 1 ? `${field.value} days` : "day"}
                    </div>
                  </>
                )}
              />
            </div>

            <FormControl label="Note" className="mb-0">
              <TextArea
                placeholder="Remember to rotate the AWS secret every month."
                className="border border-mineshaft-600 text-sm"
                rows={8}
                defaultValue={note || ""}
                reSize="none"
                cols={30}
                {...register("note")}
              />
            </FormControl>

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
                    className="w-full"
                    placeholder="Select reminder recipients..."
                    isMulti
                    name="recipients"
                    options={members.map((member) => ({
                      label: member.user.username || member.user.email,
                      value: member.user.id
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
              )}
            />
          </div>
          <div className="mt-7 flex items-center space-x-4">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="layout-create-project-submit"
              className=""
              leftIcon={<FontAwesomeIcon icon={faClock} />}
              type="submit"
            >
              {repeatDays ? "Update" : "Create"} reminder
            </Button>
            {repeatDays && (
              <Button
                key="layout-cancel-create-project"
                onClick={() => onOpenChange(false, { days: null, note: null })}
                colorSchema="danger"
                leftIcon={<FontAwesomeIcon icon={faTrash} />}
              >
                Delete reminder
              </Button>
            )}
            <Button
              key="layout-cancel-create-project"
              onClick={() => onOpenChange(false)}
              variant="plain"
              colorSchema="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
