import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Button, FormControl, Input, Modal, ModalContent, TextArea } from "@app/components/v2";

const ReminderFormSchema = z.object({
  note: z.string().optional(),
  days: z
    .number()
    .min(1, { message: "Must be at least 1 day" })
    .max(365, { message: "Must be less than 365 days" })
});
export type TReminderFormSchema = z.infer<typeof ReminderFormSchema>;

interface ReminderFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean, data?: TReminderFormSchema) => void;
}

export const CreateReminderForm = ({ isOpen, onOpenChange }: ReminderFormProps) => {
  const {
    register,
    control,
    reset,
    setValue,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TReminderFormSchema>({
    resolver: zodResolver(ReminderFormSchema)
  });

  const handleFormSubmit = async (data: TReminderFormSchema) => {
    console.log(data);
    onOpenChange(false, data);
  };

  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Create secret reminder"
        // ? QUESTION: Should this specifically say its for secret rotation?
        // ? Or should we be call it something more generic?
        subTitle={
          <div>
            Set up a reminder for when this secret should be rotated. Everyone with access to this
            project will be notified when the reminder is triggered.
          </div>
        }
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
                      label="How many days between"
                      isError={Boolean(fieldState.error)}
                      errorText={fieldState.error?.message || ""}
                    >
                      <Input
                        onChange={(el) => setValue("days", parseInt(el.target.value, 10))}
                        type="number"
                        placeholder="31"
                      />
                    </FormControl>
                    <div
                      className={twMerge(
                        "mt-2 ml-1 text-xs",
                        field.value ? "opacity-60" : "opacity-0"
                      )}
                    >
                      Every {field.value > 1 ? `${field.value} days` : "day"}
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
          <div className="mt-7 flex items-center">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="layout-create-project-submit"
              className="mr-4"
              leftIcon={<FontAwesomeIcon icon={faClock} />}
              type="submit"
            >
              Create reminder
            </Button>
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
