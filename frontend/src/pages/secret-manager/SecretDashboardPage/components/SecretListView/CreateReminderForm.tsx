import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faClock, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Button, FormControl, Input, Modal, ModalContent, TextArea } from "@app/components/v2";

const ReminderFormSchema = z.object({
  note: z.string().optional().nullable(),
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
  onOpenChange: (isOpen: boolean, data?: TReminderFormSchema) => void;
}

export const CreateReminderForm = ({
  isOpen,
  onOpenChange,
  repeatDays,
  note
}: ReminderFormProps) => {
  const {
    register,
    control,
    reset,
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
    if (isOpen) {
      reset({
        days: repeatDays || undefined,
        note: note || ""
      });
    }
  }, [isOpen]);

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
                      className="mb-0"
                      label="Reminder Interval (in days)"
                      isError={Boolean(fieldState.error)}
                      errorText={fieldState.error?.message || ""}
                    >
                      <Input
                        onChange={(el) => setValue("days", parseInt(el.target.value, 10))}
                        type="number"
                        placeholder="31"
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
                reSize="none"
                cols={30}
                {...register("note")}
              />
            </FormControl>
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
